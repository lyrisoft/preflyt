import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { RedisCacheService } from '../cache/redis-cache.service.js'

export class GitHubRateLimitError extends ServiceUnavailableException {
  constructor(milliseconds: number) {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000))
    super({
      statusCode: 503,
      code: 'GITHUB_RATE_LIMITED',
      message:
        'GitHub requests are temporarily paused. Retry after the indicated time.',
      retryAfterSeconds: seconds,
      retryAt: new Date(Date.now() + seconds * 1000).toISOString(),
    })
  }
}
type HeadersLike = Headers | Record<string, unknown>
type GitHubOperation = 'installation.verify' | 'token.create' | 'contents' | 'branches' | 'actions' | 'repository' | 'other'
function header(headers: HeadersLike | undefined, name: string) {
  return headers instanceof Headers
    ? headers.get(name)
    : String(headers?.[name] ?? '')
}
export function rateDelay(
  status: number,
  headers?: HeadersLike,
  message = '',
  now = Date.now(),
): number | null {
  const retry = header(headers, 'retry-after')
  const remaining = header(headers, 'x-ratelimit-remaining')
  const secondary =
    /secondary rate limit|abuse detection|rate limit exceeded/i.test(message)
  if (
    status !== 429 &&
    !(status === 403 && (remaining === '0' || retry || secondary))
  )
    return null
  const values: number[] = []
  if (retry) {
    const numeric = /^\d+(\.\d+)?$/.test(retry)
      ? Number(retry) * 1000
      : Date.parse(retry) - now
    if (Number.isFinite(numeric) && numeric >= 0) values.push(numeric + 1000)
  }
  if (remaining === '0') {
    const reset = Number(header(headers, 'x-ratelimit-reset')) * 1000 - now
    if (Number.isFinite(reset) && reset >= 0) values.push(reset + 1000)
  }
  return values.length ? Math.max(...values) : 60_000
}
/** Pacing is conservative per auth budget; cooldown persists in Redis without credentials. */
export class GitHubRequestLimiter {
  private readonly logger = new Logger(GitHubRequestLimiter.name)
  private readonly slots = new Map<string, number>()
  private readonly cooldowns = new Map<string, number>()
  private readonly reads = new Map<string, Promise<unknown>>()
  private readonly budgets = new Map<string, { limit: number; remaining: number; reset: number }>()
  private readonly backgroundSlots = new Map<string, number>()
  private readonly background = process.env.GITHUB_REQUEST_PRIORITY === 'background'
  private readonly reservePercent = Math.min(50, Math.max(1, Number(process.env.GITHUB_INTERACTIVE_RESERVE_PERCENT) || 10))
  constructor(private readonly cache?: RedisCacheService) {}
  private key(scope: string) {
    return createHash('sha256').update(scope).digest('hex')
  }
  async run<T extends { status: number; headers?: HeadersLike }>(
    scope: string,
    action: () => Promise<T>,
    safeRetry = true,
    operation: GitHubOperation = 'other',
  ): Promise<T> {
    const key = this.key(scope)
    for (let attempt = 0; attempt < 3; attempt++) {
      const localCooldown = (this.cooldowns.get(key) ?? 0) - Date.now()
      if (localCooldown > 0) throw new GitHubRateLimitError(localCooldown)
      // A busy local queue is not an upstream rate-limit failure. Wait for a
      // reservable slot, bounded to 30 seconds; real cooldowns still defer work.
      const deadline = Date.now() + 30000
      let reservedReset = 0
      for (;;) {
        const permit = await this.cache?.githubBudgetPermit?.(key, this.background, this.reservePercent)
        if (!permit && this.cache?.configured) throw new ServiceUnavailableException('GitHub request coordination is unavailable. Try again shortly.')
        if (permit?.granted) reservedReset = permit.reset ?? 0
        if (permit?.blocked) throw new GitHubRateLimitError(permit.wait)
        let wait = permit?.wait ?? await this.cache?.githubPermit(key)
        if (wait == null) {
          const now = Date.now(), budget = this.budgets.get(key)
          const reserve = this.background && budget ? Math.ceil(budget.limit * this.reservePercent / 100) : 0
          const current = budget && budget.reset > now ? budget : undefined
          if (current && current.remaining <= reserve) throw new GitHubRateLimitError(current.reset - now)
          const slot = Math.max(now, this.slots.get(key) ?? 0, this.background ? this.backgroundSlots.get(key) ?? 0 : 0)
          wait = slot - now
          if (wait <= 2000) {
            this.slots.set(key, slot + 250)
            if (this.background && current) this.backgroundSlots.set(key, slot + Math.max(250, Math.ceil((current.reset - now) / (current.remaining - reserve))))
            if (current) { current.remaining--; reservedReset = current.reset }
          }
        }
        if (wait <= 2000) {
          if (wait > 0) await delay(wait)
          break
        }
        const cooldown = Math.max((this.cooldowns.get(key) ?? 0) - Date.now(),
          (await this.cache?.githubRemainingCooldown(key)) ?? 0)
        if (cooldown > 0) throw new GitHubRateLimitError(cooldown)
        if (Date.now() + wait > deadline) throw new GitHubRateLimitError(wait)
        await delay(Math.min(1000, Math.max(50, wait - 2000)))
      }
      // Another in-flight request may have reported a cooldown while this slot waited.
      const paused = Math.max(
        (this.cooldowns.get(key) ?? 0) - Date.now(),
        (await this.cache?.githubRemainingCooldown(key)) ?? 0,
      )
      if (paused > 0) throw new GitHubRateLimitError(paused)
      let response: T
      try {
        response = await action()
      } catch (error) {
        const e = error as {
          status?: number
          response?: { headers?: HeadersLike }
          message?: string
        }
        const cooldown = rateDelay(
          e?.status ?? 0,
          e?.response?.headers,
          e?.message,
        )
        await this.observeBudget(key, e.response?.headers)
        if (cooldown !== null) {
          this.reportLimit(scope, key, operation, e.status ?? 0, e.response?.headers, cooldown)
          await this.pause(key, cooldown)
          throw new GitHubRateLimitError(cooldown)
        }
        if (
          !safeRetry ||
          attempt === 2 ||
          ![502, 503, 504].includes(e?.status ?? 0)
        )
          throw error
        await delay(100 * 2 ** attempt + Math.floor(Math.random() * 100))
        continue
      }
      let message = ''
      await this.observeBudget(key, response.headers)
      if (response.status === 304 && reservedReset) {
        // Authenticated conditional hits do not spend GitHub's primary budget.
        const budget = this.budgets.get(key)
        if (budget && budget.reset === reservedReset && budget.reset > Date.now()) budget.remaining = Math.min(budget.limit, budget.remaining + 1)
        await this.cache?.githubRefundBudget?.(key, reservedReset)
      }
      if (response.status === 403 && response instanceof Response) {
        // GitHub secondary limits can lack headers. Bound inspection of their error body.
        const reader = response.clone().body?.getReader()
        try {
          const chunk = await reader?.read()
          message = new TextDecoder().decode(chunk?.value?.slice(0, 4096))
        } finally {
          void reader?.cancel().catch(() => undefined)
        }
      }
      const cooldown = rateDelay(response.status, response.headers, message)
      if (cooldown !== null) {
        this.reportLimit(scope, key, operation, response.status, response.headers, cooldown)
        await this.pause(key, cooldown)
        throw new GitHubRateLimitError(cooldown)
      }
      if (header(response.headers, 'x-ratelimit-remaining') === '0') {
        const reset =
          Number(header(response.headers, 'x-ratelimit-reset')) * 1000 -
          Date.now()
        if (Number.isFinite(reset) && reset > 0) {
          this.reportLimit(scope, key, operation, response.status, response.headers, reset + 1000)
          await this.pause(key, reset + 1000)
        }
      }
      if (
        safeRetry &&
        attempt < 2 &&
        [502, 503, 504].includes(response.status)
      ) {
        if (response instanceof Response) await response.body?.cancel()
        await delay(100 * 2 ** attempt + Math.floor(Math.random() * 100))
        continue
      }
      return response
    }
    throw new ServiceUnavailableException('GitHub request failed')
  }
  private async observeBudget(key: string, headers?: HeadersLike) {
    const limit = Number(header(headers, 'x-ratelimit-limit'))
    const remainingText = header(headers, 'x-ratelimit-remaining')
    const remaining = Number(remainingText)
    const reset = Number(header(headers, 'x-ratelimit-reset')) * 1000
    if (!Number.isSafeInteger(limit) || limit <= 0 || !remainingText || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > limit || !Number.isSafeInteger(reset) || reset <= Date.now()) return
    const prior = this.budgets.get(key)
    if (!prior || prior.reset < reset) this.budgets.set(key, { limit, remaining, reset })
    else if (prior.reset === reset) prior.remaining = Math.min(prior.remaining, remaining)
    await this.cache?.githubObserveBudget?.(key, limit, remaining, reset)
  }
  private reportLimit(scope: string, key: string, operation: GitHubOperation, status: number, headers: HeadersLike | undefined, milliseconds: number) {
    const numeric = (name: string) => {
      const value = header(headers, name)
      return value && /^\d+$/.test(value) ? Number(value) : null
    }
    // Never log tokens, raw URLs, error bodies, repository names or source paths.
    this.logger.warn({
      event: 'github.rate_limit',
      budget: scope.startsWith('app:') ? 'app' : scope.startsWith('installation:') ? 'installation' : 'other',
      scopeHash: key,
      operation,
      upstreamStatus: status,
      kind: header(headers, 'x-ratelimit-remaining') === '0' ? 'primary' : 'secondary_or_unspecified',
      limit: numeric('x-ratelimit-limit'),
      remaining: numeric('x-ratelimit-remaining'),
      resetEpochSeconds: numeric('x-ratelimit-reset'),
      retryAfterSeconds: Math.ceil(milliseconds / 1000),
    })
  }
  private async pause(key: string, milliseconds: number) {
    this.cooldowns.set(
      key,
      Math.max(this.cooldowns.get(key) ?? 0, Date.now() + milliseconds),
    )
    await this.cache?.githubCooldown(key, milliseconds)
  }
  singleFlight<T>(key: string, action: () => Promise<T>): Promise<T> {
    const existing = this.reads.get(key)
    if (existing) return existing as Promise<T>
    const result = action().finally(() => this.reads.delete(key))
    this.reads.set(key, result)
    return result
  }
}

/** Durable verification work uses the same retry contract without claiming GitHub rejected a request. */
export class GitHubRefreshPendingError extends GitHubRateLimitError {
  constructor(milliseconds = 5000) { super(milliseconds); this.message = 'GitHub access verification is pending. Retry shortly.' }
  override getResponse() {
    return {...super.getResponse() as Record<string, unknown>, code: 'GITHUB_SYNC_PENDING', message: 'GitHub access verification is pending. Retry shortly.'}
  }
}
