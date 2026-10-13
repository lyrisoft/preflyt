import { ServiceUnavailableException } from '@nestjs/common'
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
  private readonly slots = new Map<string, number>()
  private readonly cooldowns = new Map<string, number>()
  private readonly reads = new Map<string, Promise<unknown>>()
  constructor(private readonly cache?: RedisCacheService) {}
  private key(scope: string) {
    return createHash('sha256').update(scope).digest('hex')
  }
  async run<T extends { status: number; headers?: HeadersLike }>(
    scope: string,
    action: () => Promise<T>,
    safeRetry = true,
  ): Promise<T> {
    const key = this.key(scope)
    for (let attempt = 0; attempt < 3; attempt++) {
      const localCooldown = (this.cooldowns.get(key) ?? 0) - Date.now()
      if (localCooldown > 0) throw new GitHubRateLimitError(localCooldown)
      let wait = await this.cache?.githubPermit(key)
      if (wait == null) {
        const now = Date.now(),
          slot = Math.max(now, this.slots.get(key) ?? 0)
        wait = slot - now
        if (wait <= 2000) this.slots.set(key, slot + 250)
      }
      if (wait > 2000) throw new GitHubRateLimitError(wait)
      if (wait > 0) await delay(wait)
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
        if (cooldown !== null) {
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
        await this.pause(key, cooldown)
        throw new GitHubRateLimitError(cooldown)
      }
      if (header(response.headers, 'x-ratelimit-remaining') === '0') {
        const reset =
          Number(header(response.headers, 'x-ratelimit-reset')) * 1000 -
          Date.now()
        if (Number.isFinite(reset) && reset > 0)
          await this.pause(key, reset + 1000)
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
