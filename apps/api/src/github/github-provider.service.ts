import { normalizeGitHubEvent } from '../github-events/github-event.js'
import { createHash } from 'node:crypto'
import {
  wantsProfileContent,
  validProfileBranch,
  type RepositorySnapshot,
  type RepositoryFile,
} from './repository-profile.js'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  Inject,
  Optional,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { RedisCacheService } from '../cache/redis-cache.service.js'
import {
  GitHubRequestLimiter,
  GitHubRateLimitError,
} from './github-rate-limit.js'
import { App } from '@octokit/app'

export type GitHubInstallationInfo = {
  id: bigint
  accountLogin: string
  accountId?: bigint
  accountType: string
  repositorySelection: string
  permissions: Record<string, string>
}

export type GitHubRepositoryInfo = {
  id: bigint
  name: string
  fullName: string
  ownerLogin: string
  defaultBranch: string | null
  isPrivate: boolean
}

export class GitHubInstallationRevokedError extends Error {
  constructor() {
    super('GitHub App installation is missing, suspended, or revoked')
    this.name = 'GitHubInstallationRevokedError'
  }
}

@Injectable()
export class GitHubProviderService {
  private app?: App
  private readonly cancellation = new AbortController()
  close() {
    this.cancellation.abort()
  }
  private readonly limiter: GitHubRequestLimiter
  private readonly tokens = new Map<
    string,
    { token: string; expiresAt: number }
  >()
  constructor(
    @Optional()
    @Inject(RedisCacheService)
    private readonly cache?: RedisCacheService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {
    this.limiter = new GitHubRequestLimiter(cache)
  }
  private async installationToken(
    installationId: bigint,
    repositoryId?: bigint,
    permission: 'contents' | 'pull_requests' = 'contents',
  ) {
    const installation = await this.prisma?.gitHubInstallation.findUnique({
      where: { id: installationId },
      select: { accessRevision: true },
    })
    const key = `${installationId}:${repositoryId ?? 'inventory'}:${installation?.accessRevision ?? 0}${permission === 'pull_requests' ? ':pull_requests' : ''}`
    for (const [entry, value] of this.tokens)
      if (value.expiresAt <= Date.now() + 60000) this.tokens.delete(entry)
    const cached = this.tokens.get(key)
    if (cached) return cached.token
    return this.limiter.singleFlight('token:' + key, async () => {
      const response = await this.appRequest(
        'POST /app/installations/{installation_id}/access_tokens',
        {
          installation_id: Number(installationId),
          ...(repositoryId ? { repository_ids: [Number(repositoryId)] } : {}),
          permissions: { metadata: 'read', [permission]: 'read' },
        },
      )
      const expiresAt = Date.parse(response.data.expires_at)
      if (
        typeof response.data.token !== 'string' ||
        !Number.isFinite(expiresAt)
      )
        throw new ServiceUnavailableException(
          'GitHub issued an invalid installation token',
        )
      this.tokens.set(key, { token: response.data.token, expiresAt })
      return response.data.token as string
    })
  }

  private appRequest(route: string, options: Record<string, unknown>) {
    return this.limiter.run(
      `app:${this.requireAppId()}`,
      () =>
        this.requireApp().octokit.request(route, {
          ...options,
          request: {
            timeout: 10_000,
            signal: this.cancellation.signal,
            ...((options.request as Record<string, unknown>) ?? {}),
          },
        }),
      route.startsWith('GET '),
    )
  }
  private apiFetch(scope: string, url: string | URL, options: RequestInit) {
    return this.limiter.run(
      scope,
      () =>
        fetch(url, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, this.cancellation.signal])
            : this.cancellation.signal,
        }),
      !options.method || options.method === 'GET',
    )
  }

  createInstallationUrl(state: string) {
    return this.requireApp().getInstallationUrl({ state })
  }

  createUserAuthorizationUrl(state: string, codeChallenge: string) {
    const clientId = this.requireClientId()
    const redirectUri = this.requireCallbackUrl()
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('allow_signup', 'false')
    return url.href
  }

  verifyInstallation(installationId: bigint) {
    return this.limiter.singleFlight(`verify:${installationId}`, () =>
      this.loadInstallation(installationId),
    )
  }
  private async loadInstallation(installationId: bigint) {
    let data
    try {
      const response = await this.appRequest(
        'GET /app/installations/{installation_id}',
        {
          installation_id: Number(installationId),
          request: { timeout: 10_000 },
        },
      )
      data = response.data
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status?: number }).status === 404
      ) {
        throw new GitHubInstallationRevokedError()
      }
      throw error
    }
    const appId = BigInt(this.requireAppId())
    if (
      BigInt(data.id) !== installationId ||
      BigInt(data.app_id) !== appId ||
      data.suspended_at
    ) {
      if (data.suspended_at) throw new GitHubInstallationRevokedError()
      throw new Error('GitHub installation belongs to another App')
    }
    const account = data.account
    if (!account || !('login' in account) || !account.login) {
      throw new Error('GitHub installation account is unavailable')
    }
    return {
      id: installationId,
      accountLogin: account.login,
      accountId: account.id ? BigInt(account.id) : undefined,
      accountType: account.type,
      repositorySelection: data.repository_selection,
      permissions: data.permissions as Record<string, string>,
    } satisfies GitHubInstallationInfo
  }

  async exchangeUserCode(code: string, codeVerifier: string) {
    const formBody = new URLSearchParams({
      client_id: this.requireClientId(),
      client_secret: this.requireClientSecret(),
      code,
      redirect_uri: this.requireCallbackUrl(),
      code_verifier: codeVerifier,
    })
    const response = await this.apiFetch(
      `oauth:${this.requireClientId()}`,
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) throw new Error('GitHub user authorization failed')
    const tokenResponse = (await response.json()) as {
      access_token?: unknown
      error?: unknown
    }
    if (
      typeof tokenResponse.access_token !== 'string' ||
      !tokenResponse.access_token
    ) {
      throw new Error('GitHub did not issue a user authorization token')
    }
    return tokenResponse.access_token
  }

  async userCanAccessInstallation(userToken: string, installationId: bigint) {
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL('https://api.github.com/user/installations')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))
      const response = await this.apiFetch(`user:${userToken}`, url, {
        headers: this.apiHeaders(userToken),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok)
        throw new Error('Unable to verify GitHub installation owner')
      const body = (await response.json()) as {
        installations?: Array<{ id?: number }>
      }
      const installations = body.installations ?? []
      if (
        installations.some(
          (installation) => BigInt(installation.id ?? 0) === installationId,
        )
      ) {
        return
      }
      if (installations.length < 100) {
        throw new ForbiddenException(
          'Installing GitHub user cannot access this installation',
        )
      }
    }
    throw new Error(
      'GitHub installation list exceeded the safe pagination limit',
    )
  }

  async revokeUserToken(userToken: string) {
    const credentials = Buffer.from(
      `${this.requireClientId()}:${this.requireClientSecret()}`,
    ).toString('base64')
    const response = await this.apiFetch(
      `app:${process.env.GITHUB_APP_ID ?? this.requireClientId()}`,
      `https://api.github.com/applications/${this.requireClientId()}/token`,
      {
        method: 'DELETE',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Basic ${credentials}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ access_token: userToken }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok && response.status !== 404) {
      throw new Error('Unable to revoke temporary GitHub user token')
    }
  }

  listInstallationRepositories(installationId: bigint) {
    return this.limiter.singleFlight(`inventory:${installationId}`, () =>
      this.loadInstallationRepositories(installationId),
    )
  }
  private async loadInstallationRepositories(installationId: bigint) {
    let token
    try {
      token = { token: await this.installationToken(installationId) }
    } catch (error) {
      if (this.isNotFound(error)) throw new GitHubInstallationRevokedError()
      throw error
    }
    const repositories: GitHubRepositoryInfo[] = []
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL('https://api.github.com/installation/repositories')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))
      const response = await this.apiFetch(
        `installation:${installationId}`,
        url,
        {
          headers: this.apiHeaders(token.token),
          signal: AbortSignal.timeout(10_000),
        },
      )
      if ([401, 403, 404].includes(response.status))
        for (const key of this.tokens.keys())
          if (key.startsWith(`${installationId}:`)) this.tokens.delete(key)
      if (response.status === 404) throw new GitHubInstallationRevokedError()
      if (!response.ok)
        throw new Error('Unable to list GitHub installation repositories')
      const body = (await response.json()) as {
        repositories?: Array<{
          id: number
          name: string
          full_name: string
          owner: { login: string }
          default_branch?: string
          private: boolean
        }>
      }
      const pageRepositories = body.repositories ?? []
      repositories.push(
        ...pageRepositories.map((repository) => ({
          id: BigInt(repository.id),
          name: repository.name,
          fullName: repository.full_name,
          ownerLogin: repository.owner.login,
          defaultBranch: repository.default_branch ?? null,
          isPrivate: repository.private,
        })),
      )
      if (pageRepositories.length < 100) return repositories
    }
    throw new Error('GitHub repository list exceeded the safe pagination limit')
  }

  async verifyRepositoryAccess(installationId: bigint, repositoryId: bigint) {
    const reader = await this.openRepository(installationId, repositoryId)
    return {
      fullName: reader.metadata.full_name,
      branch: reader.metadata.default_branch,
    }
  }

  async listRepositoryBranches(
    installationId: bigint,
    repositoryId: bigint,
    page = 1,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid branch list page')
    // Recheck upstream repository access before returning even cached branch names.
    const { metadata, request } = await this.openRepository(
      installationId,
      repositoryId,
    )
    const access = await this.prisma?.gitHubInstallation.findUnique({
      where: { id: installationId },
      select: { accessRevision: true },
    })
    const key = `github-branches:${this.requireAppId()}:${installationId}:${repositoryId}:${access?.accessRevision ?? 0}:${page}`
    const cached = await this.cache?.get(key)
    if (cached) {
      try {
        const value = JSON.parse(cached)
        if (
          Array.isArray(value.branches) &&
          value.branches.length <= 100 &&
          value.branches.every((name: unknown) => validProfileBranch(name)) &&
          typeof value.hasMore === 'boolean'
        )
          return value as { branches: string[]; hasMore: boolean }
      } catch {
        /* An invalid cache entry is replaced from GitHub. */
      }
    }
    return this.limiter.singleFlight(key, async () => {
      const rows = await request<{ name: string }[]>(
        `/repos/${encodeURIComponent(metadata.owner.login)}/${encodeURIComponent(metadata.name)}/branches?per_page=100&page=${page}`,
      )
      if (
        !Array.isArray(rows) ||
        rows.length > 100 ||
        rows.some((row) => !validProfileBranch(row?.name))
      )
        throw new ServiceUnavailableException(
          'GitHub returned an invalid branch list',
        )
      const result = {
        branches: [...new Set(rows.map((row) => row.name))],
        hasMore: rows.length === 100 && page < 1000,
      }
      await this.cache?.set(key, JSON.stringify(result), 300)
      return result
    })
  }

  async readRepositorySnapshot(
    installationId: bigint,
    repositoryId: bigint,
    branch?: string,
  ): Promise<RepositorySnapshot> {
    if (branch !== undefined && !validProfileBranch(branch))
      throw new BadRequestException(
        'Enter a valid branch name, such as development',
      )
    const { metadata, request } = await this.openRepository(
      installationId,
      repositoryId,
    )
    const inspectedBranch = branch ?? metadata.default_branch
    if (!inspectedBranch)
      throw new ServiceUnavailableException(
        'Repository has no default branch to inspect',
      )
    const base = `/repos/${encodeURIComponent(metadata.owner.login)}/${encodeURIComponent(metadata.name)}`
    let commitRef = inspectedBranch
    if (branch !== undefined) {
      const ref = await request<{
        ref: string
        object: { type: string; sha: string }
      }>(`${base}/git/ref/heads/${encodeURIComponent(branch)}`).catch(
        (error) => {
          if (error instanceof ForbiddenException)
            throw new BadRequestException(
              'That branch is unavailable. Check the branch name and GitHub access.',
            )
          throw error
        },
      )
      if (
        ref.ref !== `refs/heads/${branch}` ||
        ref.object?.type !== 'commit' ||
        !/^[a-f0-9]{40}$/.test(ref.object.sha)
      )
        throw new ServiceUnavailableException(
          'GitHub returned an invalid branch revision',
        )
      commitRef = ref.object.sha
    }
    const commit = await request<{
      sha: string
      commit: { tree: { sha: string } }
    }>(`${base}/commits/${encodeURIComponent(commitRef)}`)
    if (branch !== undefined && commit.sha !== commitRef)
      throw new ServiceUnavailableException(
        'GitHub returned a different branch revision',
      )
    const shaPattern = /^[a-f0-9]{40}$/
    if (
      !shaPattern.test(commit.sha) ||
      !shaPattern.test(commit.commit?.tree?.sha ?? '')
    ) {
      throw new ServiceUnavailableException(
        'GitHub returned an invalid source revision',
      )
    }
    const tree = await request<{
      sha: string
      truncated: boolean
      tree: Array<{
        path: string
        type: string
        mode: string
        sha: string
        size?: number
      }>
    }>(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`)
    if (tree.sha !== commit.commit.tree.sha || !Array.isArray(tree.tree))
      throw new ServiceUnavailableException(
        'GitHub returned an invalid repository tree',
      )
    const omitted = tree.tree.some(
      (entry) => entry.type === 'commit' || entry.mode === '120000',
    )
    const complete = !tree.truncated && tree.tree.length <= 10_000 && !omitted
    const warnings: string[] = []
    if (tree.truncated || tree.tree.length > 10_000)
      warnings.push(
        'Repository tree is partial; discovery is limited to 10,000 entries. Absence cannot be established.',
      )
    if (omitted)
      warnings.push(
        'Symlink or submodule content was omitted; absent controls remain unknown.',
      )
    const files: RepositoryFile[] = tree.tree
      .slice(0, 10_000)
      .filter(
        (entry) =>
          entry.type === 'blob' && ['100644', '100755'].includes(entry.mode),
      )
      .map((entry) => {
        if (
          typeof entry.path !== 'string' ||
          entry.path.length > 4096 ||
          !shaPattern.test(entry.sha)
        )
          throw new ServiceUnavailableException(
            'GitHub returned invalid file evidence',
          )
        return { path: entry.path, sha: entry.sha, size: entry.size ?? -1 }
      })
    const candidates = files
      .filter((file) => wantsProfileContent(file.path))
      .sort((a, b) => a.path.localeCompare(b.path))
    if (candidates.length > 32)
      warnings.push(
        'Manifest/workflow content inspection is limited to 32 files. Unread files remain unknown.',
      )
    let cursor = 0
    const worker = async () => {
      while (cursor < Math.min(candidates.length, 32)) {
        const file = candidates[cursor++]!
        if (file.size < 0 || file.size > 262_144) {
          file.contentError = 'size_limit'
          continue
        }
        try {
          const blob = await request<{
            sha: string
            size: number
            encoding: string
            content: string
          }>(`${base}/git/blobs/${file.sha}`)
          if (
            blob.sha !== file.sha ||
            blob.encoding !== 'base64' ||
            blob.size !== file.size ||
            typeof blob.content !== 'string' ||
            blob.content.length > 360_000
          )
            throw new Error('Invalid blob')
          const bytes = Buffer.from(blob.content, 'base64')
          const hash = createHash('sha1')
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest('hex')
          if (bytes.length !== file.size || hash !== file.sha)
            throw new Error('Blob integrity failed')
          file.content = bytes.toString('utf8')
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof GitHubRateLimitError
          )
            throw error
          file.contentError = 'unavailable_or_invalid'
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, () => worker()))
    return {
      sourceSha: commit.sha,
      treeSha: tree.sha,
      branch: inspectedBranch,
      fullName: metadata.full_name,
      complete,
      files,
      warnings,
    }
  }

  async readPullRequest(
    installationId: bigint,
    repositoryId: bigint,
    number: number,
  ) {
    if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647)
      throw new ForbiddenException('Pull request is unavailable')
    const { metadata, request } = await this.openRepository(
      installationId,
      repositoryId,
      'pull_requests',
    )
    const data = await request<Record<string, unknown>>(
      `/repos/${encodeURIComponent(metadata.owner.login)}/${encodeURIComponent(metadata.name)}/pulls/${number}`,
    )
    const normalized = normalizeGitHubEvent('pull_request', {
      action: 'edited',
      installation: { id: Number(installationId) },
      repository: { id: Number(repositoryId) },
      pull_request: data,
    })
    if (
      !normalized?.pullRequestContext ||
      normalized.sourceNumber !== number ||
      !normalized.sourceUpdatedAt
    )
      throw new ServiceUnavailableException(
        'Pull request context is unavailable',
      )
    return {
      context: normalized.pullRequestContext,
      sourceUpdatedAt: normalized.sourceUpdatedAt,
      sourceObjectId: normalized.sourceObjectId,
    }
  }

  /** Explicit bounded backfill; every request uses the existing installation limiter and scoped token. */
  async readContributorBackfill(installationId: bigint, repositoryId: bigint) {
    const repository = await this.openRepository(
      installationId,
      repositoryId,
      'pull_requests',
    )
    const path = `/repos/${repository.metadata.full_name.split('/').map(encodeURIComponent).join('/')}`
    const prs = await repository.request<any[]>(
      `${path}/pulls?state=all&sort=updated&direction=desc&per_page=30&page=1`,
    )
    const observations: { event: string; body: any }[] = prs.map((p) => ({
      event: 'pull_request',
      body: {
        installation: { id: Number(installationId) },
        repository: { id: Number(repositoryId) },
        action: p.state === 'closed' ? 'closed' : 'edited',
        pull_request: p,
      },
    }))
    let reviewsTruncated = false
    for (const p of prs.slice(0, 10)) {
      const reviews = await repository.request<any[]>(
        `${path}/pulls/${p.number}/reviews?per_page=30&page=1`,
      )
      reviewsTruncated ||= reviews.length === 30
      for (const review of reviews)
        if (review.submitted_at)
          observations.push({
            event: 'pull_request_review',
            body: {
              installation: { id: Number(installationId) },
              repository: { id: Number(repositoryId) },
              action: review.state === 'DISMISSED' ? 'dismissed' : 'submitted',
              pull_request: p,
              review,
            },
          })
    }
    const contents = await this.openRepository(
      installationId,
      repositoryId,
      'contents',
    )
    const commits = await contents.request<any[]>(
      `${path}/commits?per_page=30&page=1`,
    )
    for (const c of commits)
      observations.push({
        event: 'push',
        body: {
          installation: { id: Number(installationId) },
          repository: { id: Number(repositoryId) },
          commits: [
            {
              id: c.sha,
              author: c.author,
              committer: c.committer,
              timestamp: c.commit?.author?.date ?? c.commit?.committer?.date,
            },
          ],
        },
      })
    return {
      observations,
      truncated:
        prs.length === 30 ||
        prs.length > 10 ||
        reviewsTruncated ||
        commits.length === 30,
      limits: {
        pullRequests: 30,
        reviewedPullRequests: 10,
        reviewsPerPr: 30,
        commits: 30,
      },
    }
  }

  private async openRepository(
    installationId: bigint,
    repositoryId: bigint,
    permission: 'contents' | 'pull_requests' = 'contents',
  ) {
    try {
      await this.verifyInstallation(installationId)
    } catch (error) {
      if (error instanceof GitHubRateLimitError) throw error
      if (error instanceof GitHubInstallationRevokedError)
        throw new ForbiddenException(
          'GitHub installation access is unavailable',
        )
      throw new ServiceUnavailableException(
        'GitHub installation could not be verified',
      )
    }
    let token: string
    try {
      token = await this.installationToken(
        installationId,
        repositoryId,
        permission,
      )
    } catch (error) {
      if (error instanceof GitHubRateLimitError) throw error
      if (this.isNotFound(error))
        throw new ForbiddenException('GitHub repository access is unavailable')
      throw new ServiceUnavailableException(
        'Unable to authorize repository inspection',
      )
    }
    const signal = AbortSignal.timeout(60_000)
    const request = async <T>(path: string): Promise<T> => {
      const response = await this.apiFetch(
        `installation:${installationId}`,
        `https://api.github.com${path}`,
        {
          headers: this.apiHeaders(token),
          redirect: 'error',
          signal,
        },
      )
      if ([401, 403, 404].includes(response.status))
        for (const key of this.tokens.keys())
          if (key.startsWith(`${installationId}:`)) this.tokens.delete(key)
      if (
        response.status === 401 ||
        response.status === 404 ||
        (response.status === 403 &&
          response.headers.get('x-ratelimit-remaining') !== '0' &&
          !response.headers.has('retry-after'))
      )
        throw new ForbiddenException('GitHub repository access is unavailable')
      if (!response.ok || !response.body)
        throw new ServiceUnavailableException(
          'GitHub repository inspection is unavailable; try again later',
        )
      const stream = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const chunk = await stream.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 8_000_000) {
          await stream.cancel()
          throw new ServiceUnavailableException(
            'GitHub response exceeded the discovery limit',
          )
        }
        chunks.push(chunk.value)
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
    }
    const metadata = await request<{
      id: number
      name: string
      full_name: string
      owner: { login: string }
      default_branch: string | null
    }>(`/repositories/${repositoryId}`)
    if (
      BigInt(metadata.id) !== repositoryId ||
      !metadata.owner?.login ||
      !metadata.name
    )
      throw new ForbiddenException(
        'GitHub repository identity could not be verified',
      )
    return { metadata, request }
  }

  private apiHeaders(token: string) {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    }
  }

  private isNotFound(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status?: number }).status === 404
    )
  }

  private requireApp() {
    if (this.app) return this.app
    const appId = this.requireAppId()
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!privateKey)
      throw new ServiceUnavailableException('GitHub App is not configured')
    this.app = new App({
      appId,
      privateKey,
      log: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    })
    return this.app
  }

  private requireAppId() {
    const appId = process.env.GITHUB_APP_ID
    if (!appId || !/^\d+$/.test(appId)) {
      throw new ServiceUnavailableException('GitHub App is not configured')
    }
    return appId
  }

  private requireClientId() {
    const clientId = process.env.GITHUB_APP_CLIENT_ID
    if (!clientId)
      throw new ServiceUnavailableException('GitHub App is not configured')
    return clientId
  }

  private requireClientSecret() {
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET
    if (!clientSecret)
      throw new ServiceUnavailableException('GitHub App is not configured')
    return clientSecret
  }

  private requireCallbackUrl() {
    const callback = process.env.GITHUB_APP_OAUTH_CALLBACK_URL
    if (!callback)
      throw new ServiceUnavailableException('GitHub App is not configured')
    const url = new URL(callback)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        'GitHub callback URL must use HTTPS',
      )
    }
    return url.href
  }
}
