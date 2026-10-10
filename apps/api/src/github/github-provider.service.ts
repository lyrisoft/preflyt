import { configurationValue } from '../configuration/runtime-configuration.js'
import { sameReviewPr, prReviewSource } from '../intelligence/pr-review-context.js'
import type { PullRequestContext } from '../github-events/pull-request-context.js'
import { readPinnedNativeSource } from '../execution/native-source.js'
import { attributedSuite, summarizeRulesetSuites, type RulesetSuite } from './ruleset-insights.js'
import { rulesetSummary, rulesetDetail } from './github-ruleset.js'
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
  ConflictException,
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
    permission: 'contents' | 'pull_requests' | 'metadata' | 'actions' | 'checks' | 'administration' | 'members' = 'contents',
  ) {
    const installation = await this.prisma?.gitHubInstallation.findUnique({
      where: { id: installationId },
      select: { accessRevision: true },
    })
    const key = `${installationId}:${repositoryId ?? 'inventory'}:${installation?.accessRevision ?? 0}${permission !== 'contents' ? ':' + permission : ''}`
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
  /** Internal organization directory access; never return the token to a client. */
  async withOrganizationMembers<T>(
    installationId: bigint,
    organizationId: bigint,
    read: (token: string, login: string) => Promise<T>,
  ): Promise<T> {
    const installation = await this.verifyInstallation(installationId)
    if (installation.accountType !== 'Organization' || installation.accountId !== organizationId)
      throw new ForbiddenException('The GitHub installation does not match this linked organization')
    if (!['read', 'write'].includes(installation.permissions.members))
      throw new ForbiddenException('The GitHub App needs Organization Members: Read-only. Approve the updated installation permissions, then retry sync.')
    const token = await this.installationToken(installationId, undefined, 'members')
    return read(token, installation.accountLogin)
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
      `app:${configurationValue('GITHUB_APP_ID') ?? this.requireClientId()}`,
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

  /** Internal checkout broker only; tokens never appear in the returned source bundle. */
  async readNativeSource(installationId: bigint, repositoryId: bigint, sourceSha: string, signal?: AbortSignal) {
    if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new BadRequestException('Use an exact source commit for native checks')
    signal?.throwIfAborted()
    const reader = await this.openRepository(installationId, repositoryId, 'contents', signal)
    const base = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
    return readPinnedNativeSource(reader.request, base, repositoryId.toString(), sourceSha, signal)
  }

  async verifyRepositoryAccess(installationId: bigint, repositoryId: bigint) {
    const reader = await this.openRepository(installationId, repositoryId)
    return {
      fullName: reader.metadata.full_name,
      branch: reader.metadata.default_branch,
    }
  }

  private async readRulesets<T>(
    installationId: bigint,
    repositoryId: bigint,
    suffix: string,
    load: (
      reader: Awaited<ReturnType<GitHubProviderService['openRepository']>>,
    ) => Promise<T>,
    refresh = false,
  ) {
    // Even cached responses require current installation and repository access.
    const reader = await this.openRepository(
      installationId,
      repositoryId,
      'metadata',
    )
    const access = await this.prisma?.gitHubInstallation.findUnique({
      where: { id: installationId },
      select: { accessRevision: true },
    })
    const key = `github-rulesets:v1:${this.requireAppId()}:${installationId}:${repositoryId}:${access?.accessRevision ?? 0}:${suffix}`
    const cached = refresh ? undefined : await this.cache?.get(key)
    if (cached) {
      try {
        return JSON.parse(cached) as T
      } catch {
        /* Re-read malformed cache. */
      }
    }
    return this.limiter.singleFlight(`${key}:${refresh ? 'refresh' : 'read'}`, async () => {
      const result = await load(reader)
      await this.cache?.set(key, JSON.stringify(result), 300)
      return result
    })
  }
  async listRepositoryRulesets(
    installationId: bigint,
    repositoryId: bigint,
    page = 1,
    refresh = false,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid ruleset page')
    return this.readRulesets(
      installationId,
      repositoryId,
      `list:${page}`,
      async ({ metadata, request }) => {
        const rows = await request<unknown>(
          `/repos/${encodeURIComponent(metadata.owner.login)}/${encodeURIComponent(metadata.name)}/rulesets?includes_parents=true&per_page=20&page=${page}`,
        )
        if (!Array.isArray(rows) || rows.length > 20)
          throw new ServiceUnavailableException(
            'GitHub returned an invalid ruleset list',
          )
        return {
          rulesets: rows.map((row) => rulesetSummary(row, metadata.full_name)),
          page,
          hasMore: rows.length === 20 && page < 1000,
          fetchedAt: new Date().toISOString(),
        }
      },
      refresh,
    )
  }
  async getRepositoryRuleset(
    installationId: bigint,
    repositoryId: bigint,
    id: number,
  ) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Invalid ruleset ID')
    return this.readRulesets(
      installationId,
      repositoryId,
      `detail:${id}`,
      async ({ metadata, request }) => {
        const row = await request<unknown>(
          `/repos/${encodeURIComponent(metadata.owner.login)}/${encodeURIComponent(metadata.name)}/rulesets/${id}?includes_parents=true`,
        )
        return {
          ruleset: rulesetDetail(row, metadata.full_name, id),
          fetchedAt: new Date().toISOString(),
        }
      },
    )
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

  async readReadinessWorkflowRun(installationId: bigint, repositoryId: bigint, runId: string) {
    if(!/^[1-9]\d{0,15}$/.test(runId) || !Number.isSafeInteger(Number(runId)))throw new BadRequestException('Invalid workflow run')
    const reader=await this.openRepository(installationId,repositoryId,'actions')
    const root=`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
    const run=await reader.request<Record<string,any>>(`${root}/actions/runs/${runId}`)
    if(String(run.id)!==runId || String(run.repository?.id)!==repositoryId.toString() || String(run.head_repository?.id)!==repositoryId.toString() || !Number.isSafeInteger(run.run_attempt) || run.run_attempt<1 || !Number.isSafeInteger(run.workflow_id) || run.workflow_id<1 || !/^[a-f0-9]{40}$/.test(run.head_sha))throw new ServiceUnavailableException('Workflow run identity could not be verified')
    return {sourceSha:run.head_sha,runAttempt:run.run_attempt,status:run.status,conclusion:run.conclusion,workflowId:String(run.workflow_id),event:String(run.event),workflowPath:typeof run.path === "string" ? run.path.split("@")[0] : ""}
  }
  /** Cache display/setup sources only. Callers verify current upstream access first. */
  private async readPipelineCache<T>(
    installationId: bigint,
    repositoryId: bigint,
    suffix: string,
    refresh: boolean,
    load: () => Promise<T>,
    valid: (value: T) => boolean,
  ): Promise<T> {
    if (!this.cache) return load()
    const access = await this.prisma?.gitHubInstallation.findUnique({
      where: { id: installationId },
      select: { accessRevision: true },
    })
    const key = `github-pipeline:v1:${this.requireAppId()}:${installationId}:${repositoryId}:${access?.accessRevision ?? 0}:${suffix}`
    const cached = refresh ? null : await this.cache.get(key)
    if (cached) {
      try {
        const value = JSON.parse(cached) as T
        if (valid(value)) return value
      } catch {
        // Invalid cache entries are replaced with verified upstream data.
      }
    }
    return this.limiter.singleFlight(
      `${key}:${refresh ? 'refresh' : 'read'}`,
      async () => {
        const result = await load()
        await this.cache!.set(key, JSON.stringify(result), 300)
        return result
      },
    )
  }

  async discoverPipelineWorkflows(
    installationId: bigint,
    repositoryId: bigint,
    refresh = false,
  ) {
    const reader = await this.openRepository(
      installationId,
      repositoryId,
      'actions',
    )
    return this.readPipelineCache(
      installationId,
      repositoryId,
      'workflows',
      refresh,
      async () => {
        const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
        const response = await reader.request<{
          total_count: number
          workflows: { id: number; name: string; path: string; state: string }[]
        }>(`${root}/actions/workflows?per_page=100`)
        if (
          !Array.isArray(response.workflows) ||
          response.workflows.length > 100
        )
          throw new ServiceUnavailableException(
            'Workflow discovery is unavailable',
          )
        return {
          workflows: response.workflows
            .filter(
              (w) =>
                Number.isSafeInteger(w.id) &&
                w.id > 0 &&
                w.state === 'active' &&
                /^\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(w.path),
            )
            .map((w) => ({ id: String(w.id), name: w.name, path: w.path })),
          truncated: response.total_count > 100,
        }
      },
      (value) =>
        !!value &&
        typeof value.truncated === 'boolean' &&
        Array.isArray(value.workflows) &&
        value.workflows.length <= 100 &&
        value.workflows.every(
          (w) =>
            !!w &&
            typeof w.id === 'string' &&
            /^[1-9]\d{0,15}$/.test(w.id) &&
            typeof w.name === 'string' &&
            typeof w.path === 'string' &&
            /^\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(w.path),
        ),
    )
  }

  async readPipelineWorkflow(
    installationId: bigint,
    repositoryId: bigint,
    workflowId: string,
    branch: string,
    refresh = false,
  ) {
    branch = branch.replace(/^refs\/heads\//, '')
    if (!/^[1-9]\d{0,15}$/.test(workflowId) || !validProfileBranch(branch))
      throw new BadRequestException('Choose a repository workflow and branch')
    const reader = await this.openRepository(
      installationId,
      repositoryId,
      'contents',
    )
    return this.readPipelineCache(
      installationId,
      repositoryId,
      `workflow:${workflowId}:${encodeURIComponent(branch)}`,
      refresh,
      async () => {
        const workflows = await this.discoverPipelineWorkflows(
          installationId,
          repositoryId,
          refresh,
        )
        const workflow = workflows.workflows.find((w) => w.id === workflowId)
        if (!workflow)
          throw new BadRequestException('Choose a repository workflow')
        const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
        const branchState = await reader.request<{ commit: { sha: string } }>(
          `${root}/branches/${encodeURIComponent(branch)}`,
        )
        if (!/^[a-f0-9]{40}$/.test(branchState.commit?.sha))
          throw new ServiceUnavailableException(
            'Workflow branch could not be verified',
          )
        const file = await reader.request<{
          type: string
          encoding: string
          content: string
          size: number
          sha: string
          path: string
        }>(
          `${root}/contents/${workflow.path.split('/').map(encodeURIComponent).join('/')}?ref=${branchState.commit.sha}`,
        )
        if (
          file.type !== 'file' ||
          file.encoding !== 'base64' ||
          file.path !== workflow.path ||
          !Number.isInteger(file.size) ||
          file.size < 1 ||
          file.size > 32768 ||
          !/^[a-f0-9]{40}$/.test(file.sha) ||
          typeof file.content !== 'string'
        )
          throw new BadRequestException(
            'The workflow must be a YAML file under 32 KB',
          )
        const encoded = file.content.replace(/\s/g, ''),
          bytes = Buffer.from(encoded, 'base64')
        if (bytes.toString('base64') !== encoded || bytes.length !== file.size)
          throw new ServiceUnavailableException(
            'Workflow content could not be verified',
          )
        const content = bytes.toString('utf8')
        if (
          Buffer.from(content).length !== bytes.length ||
          content.includes('\0')
        )
          throw new BadRequestException('Workflow content must be UTF-8')
        return {
          ...workflow,
          workflow: content,
          fileSha: file.sha,
          baseSha: branchState.commit.sha,
          branch,
        }
      },
      (value) =>
        !!value &&
        value.id === workflowId &&
        value.branch === branch &&
        typeof value.name === 'string' &&
        typeof value.path === 'string' &&
        /^\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(value.path) &&
        /^[a-f0-9]{40}$/.test(value.baseSha) &&
        /^[a-f0-9]{40}$/.test(value.fileSha) &&
        typeof value.workflow === 'string' &&
        Buffer.byteLength(value.workflow) > 0 &&
        Buffer.byteLength(value.workflow) <= 32768 &&
        !value.workflow.includes('\0'),
    )
  }

  async pipelineWriteAvailability(installationId: bigint) {
    const installation = await this.verifyInstallation(installationId)
    const available = ['contents', 'workflows', 'pull_requests'].every(key => installation.permissions[key] === 'write')
    return { available, reason: available ? null : 'Creating a setup PR requires GitHub App Contents, Workflows and Pull requests write permissions.' }
  }

  /** Called only after the user reviews YAML and explicitly requests a setup PR. Never writes the base branch. */
  async createPipelineSetupPr(installationId: bigint, repositoryId: bigint, branch: string, baseSha: string, files: Record<string, string>, requestId: string) {
    branch = branch.replace(/^refs\/heads\//, '')
    if (!/^[a-f0-9]{40}$/.test(baseSha) || !/^[a-f0-9-]{36}$/.test(requestId) || Object.keys(files).length !== 4 ||
      Object.entries(files).some(([path, content]) => (!/^\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(path) && !/^\.github\/actions\/preflyt-policy\/(action.yml|run.py|transport.py)$/.test(path)) || Buffer.byteLength(content) > 65536))
      throw new BadRequestException('Invalid reviewed workflow files')
    const write = await this.pipelineWriteAvailability(installationId)
    if (!write.available) throw new ForbiddenException(write.reason!)
    const reader = await this.openRepository(installationId, repositoryId, 'contents')
    const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
    const current = await reader.request<{ commit: { sha: string } }>(`${root}/branches/${encodeURIComponent(branch)}`)
    if (current.commit?.sha !== baseSha) throw new ConflictException('The repository branch changed. Reload the workflow before creating a PR.')
    const token = (await this.appRequest('POST /app/installations/{installation_id}/access_tokens', { installation_id: Number(installationId), repository_ids: [Number(repositoryId)], permissions: { metadata: 'read', contents: 'write', workflows: 'write', pull_requests: 'write' } })).data.token
    if (typeof token !== 'string' || !token) throw new ForbiddenException('GitHub workflow write permission is unavailable')
    const call = async (path: string, method = 'GET', body?: unknown): Promise<any> => {
      const response = await this.apiFetch(`installation:${installationId}`, `https://api.github.com${root}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { ...this.apiHeaders(token), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      if (!response.ok) throw new ServiceUnavailableException('GitHub could not complete the setup PR. Retry with the same request or check the repository.')
      return response.json()
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex').slice(0, 12)
    const head = `preflyt/setup-${requestId}-${fingerprint}`
    const existing = await call(`/pulls?state=open&head=${encodeURIComponent(reader.metadata.owner.login + ':' + head)}&base=${encodeURIComponent(branch)}&per_page=1`)
    const refs = await call(`/git/matching-refs/heads/${head}`)
    let commitSha: string
    if (Array.isArray(refs) && refs.length) {
      const ref = refs.find((entry: any) => entry.ref === `refs/heads/${head}`)
      if (!ref || !/^[a-f0-9]{40}$/.test(ref.object?.sha)) throw new ConflictException('Setup branch changed')
      commitSha = ref.object.sha
      // Recover a previous uncertain attempt only when every proposed file still matches.
      for (const [path, content] of Object.entries(files)) {
        const file = await reader.request<{ sha: string }>(`${root}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commitSha}`)
        const blob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(content)}\0`), Buffer.from(content)])).digest('hex')
        if (file.sha !== blob) throw new ConflictException('The setup branch changed. Start a new review.')
      }
    } else {
      const parent = await call(`/git/commits/${baseSha}`)
      if (!/^[a-f0-9]{40}$/.test(parent.tree?.sha)) throw new ServiceUnavailableException('Repository tree could not be verified')
      const tree = await call('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) })
      if (!/^[a-f0-9]{40}$/.test(tree.sha)) throw new ServiceUnavailableException('Workflow tree could not be created')
      const commit = await call('/git/commits', 'POST', { message: 'Connect Preflyt policy checks', tree: tree.sha, parents: [baseSha] })
      if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new ServiceUnavailableException('Workflow commit could not be created')
      commitSha = commit.sha
      // No force push; a duplicate concurrent request stops here and can recover on retry.
      await call('/git/refs', 'POST', { ref: `refs/heads/${head}`, sha: commitSha })
    }
    const pr = existing[0] ?? await call('/pulls', 'POST', { title: 'Connect Preflyt policy checks', head, base: branch, body: 'Adds the reviewed Preflyt workflow changes and local Action files. Review the YAML, tool reports and existing execution-proof configuration before merging. Existing branch protection remains unchanged.' })
    const expected = `https://github.com/${reader.metadata.owner.login}/${reader.metadata.name}/pull/`
    if (!Number.isSafeInteger(pr.number) || pr.number < 1 || pr.html_url !== expected + pr.number || pr.head?.sha !== commitSha || pr.base?.ref !== branch)
      throw new ServiceUnavailableException('Setup PR could not be verified; check the repository before retrying')
    return { number: pr.number as number, url: pr.html_url as string }
  }

  async publishPipelineComment(installationId: bigint, repositoryId: bigint, number: number, headSha: string, body: string) {
    if (!Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40}$/.test(headSha) || !body.startsWith('<!-- preflyt-policy-summary -->') || body.length > 30000) throw new BadRequestException('Invalid pipeline summary')
    const before = await this.readPullRequest(installationId, repositoryId, number)
    if (before.context.state !== 'open' || before.context.head.sha !== headSha || before.context.head.repositoryId !== repositoryId.toString()) throw new ConflictException('Pull request changed before comment publication')
    const app = (await this.appRequest('GET /app', {})).data
    const reader = await this.openRepository(installationId, repositoryId, 'pull_requests')
    const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
    const token = (await this.appRequest('POST /app/installations/{installation_id}/access_tokens', { installation_id: Number(installationId), repository_ids: [Number(repositoryId)], permissions: { metadata: 'read', pull_requests: 'write' } })).data.token
    if (typeof token !== 'string' || !token) throw new ServiceUnavailableException('GitHub PR comment permission is unavailable')
    const call = async (path: string, method = 'GET', payload?: unknown) => {
      const response = await this.apiFetch(`installation:${installationId}`, `https://api.github.com${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { ...this.apiHeaders(token), 'Content-Type': 'application/json' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
      if (!response.ok) throw new ServiceUnavailableException('GitHub PR comment could not be published or verified')
      return response.json() as Promise<any>
    }
    let existing: any
    for (let page = 1; page <= 5; page++) {
      const comments = await call(`${root}/issues/${number}/comments?per_page=100&page=${page}`)
      if (!Array.isArray(comments) || comments.length > 100) throw new ServiceUnavailableException('GitHub comment history is unavailable')
      existing ??= comments.find(c => c.user?.type === 'Bot' && c.user?.login === `${app.slug}[bot]` && typeof c.body === 'string' && c.body.startsWith('<!-- preflyt-policy-summary -->'))
      if (existing || comments.length < 100) break
      if (page === 5) throw new ServiceUnavailableException('Comment discovery limit reached; refusing a duplicate summary')
    }
    const current = await this.readPullRequest(installationId, repositoryId, number)
    if (current.context.head.sha !== headSha || current.context.state !== 'open') throw new ConflictException('Pull request changed')
    const result = existing ? await call(`${root}/issues/comments/${existing.id}`, 'PATCH', { body }) : await call(`${root}/issues/${number}/comments`, 'POST', { body })
    if (!Number.isSafeInteger(result.id) || result.id < 1) throw new ServiceUnavailableException('Invalid comment receipt')
    const observed = await call(`${root}/issues/comments/${result.id}`)
    const url = new URL(String(observed.html_url))
    if (observed.body !== body || observed.user?.login !== `${app.slug}[bot]` || observed.user?.type !== 'Bot' || url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) throw new ServiceUnavailableException('PR summary read-back failed')
    if ((await this.readPullRequest(installationId, repositoryId, number)).context.head.sha !== headSha) throw new ConflictException('Pull request changed during summary publication')
    return { htmlUrl: url.href }
  }

  async checkPublicationAccess(installationId: bigint) {
    const installation = await this.verifyInstallation(installationId)
    if (installation.permissions.checks !== 'write')
      throw new ForbiddenException(
        'The GitHub App needs repository Checks: write permission. Accept the updated installation permissions and try again.',
      )
    return { appId: this.requireAppId() }
  }
  /** Bounded recovery search before a write; POST is never automatically retried. */
  async publishReadinessCheck(
    installationId: bigint,
    repositoryId: bigint,
    payload: {
      name: string
      head_sha: string
      external_id: string
      status: 'completed'
      conclusion: 'failure' | 'action_required' | 'success' | 'neutral'
      output: { title: string; summary: string }
    },
    verifiedPolicy = false,
    refreshExisting = false,
    advisory = false,
  ) {
    const { appId } = await this.checkPublicationAccess(installationId)
    // Observe previews cannot publish success; only a verified published-policy evaluation can.
    if (
      (advisory ? payload.name !== 'Preflyt / AI Review' || payload.conclusion !== 'neutral' : payload.name !== 'Preflyt / Engineering Readiness' || !(['failure', 'action_required', ...(verifiedPolicy ? ['success'] : [])]).includes(payload.conclusion)) ||
      !/^[a-f0-9]{40}$/.test(payload.head_sha) ||
      !/^[a-f0-9]{64}$/.test(payload.external_id)
    )
      throw new BadRequestException('Unsupported readiness publication')
    const reader = await this.openRepository(
      installationId,
      repositoryId,
      'metadata',
    )
    const tokenResponse = await this.appRequest(
      'POST /app/installations/{installation_id}/access_tokens',
      {
        installation_id: Number(installationId),
        repository_ids: [Number(repositoryId)],
        permissions: { metadata: 'read', checks: 'write' },
      },
    )
    const token = tokenResponse.data.token
    if (typeof token !== 'string' || !token)
      throw new ServiceUnavailableException(
        'GitHub check credentials are unavailable',
      )
    const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}`
    const call = async (path: string, body?: unknown, method = 'POST') => {
      const response = await this.apiFetch(
        `installation:${installationId}`,
        `https://api.github.com${path}`,
        {
          method: body === undefined ? 'GET' : method,
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10',
            ...(body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      )
      if (!response.ok)
        throw new ServiceUnavailableException(
          'GitHub could not publish or verify the readiness check. Retry to check for an existing publication.',
        )
      return (await response.json()) as Record<string, any>
    }
    const verify = (run: Record<string, any>) => {
      if (
        !Number.isSafeInteger(run.id) ||
        run.id < 1 ||
        String(run.app?.id) !== appId ||
        run.name !== payload.name ||
        run.external_id !== payload.external_id ||
        run.head_sha !== payload.head_sha ||
        run.status !== 'completed' ||
        run.conclusion !== payload.conclusion ||
        run.output?.title !== payload.output.title ||
        run.output?.summary !== payload.output.summary
      )
        throw new ServiceUnavailableException(
          'GitHub check verification failed. This publication is not verified.',
        )
      const url = new URL(run.html_url)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        url.username ||
        url.password
      )
        throw new ServiceUnavailableException(
          'GitHub returned an invalid check link',
        )
      return { checkRunId: String(run.id), appId, htmlUrl: url.href }
    }
    let existing: Record<string, any> | undefined
    let exhausted = false
    for (let page = 1; page <= 10; page++) {
      const params = new URLSearchParams({
        check_name: payload.name,
        filter: 'all',
        per_page: '100',
        page: String(page),
      })
      const result = await call(
        `${root}/commits/${payload.head_sha}/check-runs?${params}`,
      )
      if (!Array.isArray(result.check_runs) || result.check_runs.length > 100)
        throw new ServiceUnavailableException(
          'GitHub check history is unavailable',
        )
      const matches = result.check_runs.filter(
        (run: any) =>
          run.external_id === payload.external_id &&
          String(run.app?.id) === appId,
      )
      if (matches.length > 1 || (existing && matches.length))
        throw new ServiceUnavailableException(
          'Duplicate check publications require review',
        )
      if (matches.length) existing = matches[0]
      if (result.check_runs.length < 100) {
        exhausted = true
        break
      }
    }
    if (!exhausted)
      throw new ServiceUnavailableException(
        'Check history exceeded the safe recovery limit. No check was created.',
      )
    if (existing) {
      if (!Number.isSafeInteger(existing.id) || existing.id < 1)
        throw new ServiceUnavailableException(
          'GitHub returned an invalid check ID',
        )
      const current = await call(`${root}/check-runs/${existing.id}`)
      if (refreshExisting && (current.conclusion !== payload.conclusion || current.output?.summary !== payload.output.summary || current.output?.title !== payload.output.title)) {
        if (String(current.app?.id)!==appId || current.head_sha!==payload.head_sha || current.name!==payload.name || current.external_id!==payload.external_id)
          throw new ServiceUnavailableException('Existing readiness check identity changed')
        await call(`${root}/check-runs/${existing.id}`, {status:'completed',conclusion:payload.conclusion,output:payload.output,completed_at:new Date().toISOString()}, 'PATCH')
        return verify(await call(`${root}/check-runs/${existing.id}`))
      }
      return verify(current)
    }
    const created = await call(`${root}/check-runs`, {
      ...payload,
      completed_at: new Date().toISOString(),
    })
    if (!Number.isSafeInteger(created.id) || created.id < 1)
      throw new ServiceUnavailableException(
        'GitHub returned an invalid check ID',
      )
    return verify(await call(`${root}/check-runs/${created.id}`))
  }

  async readPublishedReadinessCheck(installationId: bigint, repositoryId: bigint, checkRunId: string, sourceSha: string) {
    if (!/^[1-9]\d{0,15}$/.test(checkRunId)) throw new BadRequestException('Invalid readiness check ID')
    const {appId}=await this.checkPublicationAccess(installationId)
    const reader=await this.openRepository(installationId, repositoryId, 'checks')
    const run=await reader.request<Record<string,any>>(`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/check-runs/${checkRunId}`)
    if(String(run.id)!==checkRunId || String(run.app?.id)!==appId || run.head_sha!==sourceSha || run.name!=='Preflyt / Engineering Readiness' || run.status!=='completed')throw new ServiceUnavailableException('Current readiness check could not be verified')
    return {appId, conclusion:run.conclusion, externalId:run.external_id, output:run.output}
  }

  async assertNoReadinessMergeQueue(installationId: bigint, repositoryId: bigint) {
    const reader=await this.openRepository(installationId,repositoryId,'metadata')
    const root=`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/rulesets`
    for(let page=1;page<=5;page++) {
      const rows=await reader.request<Record<string,any>[]>(`${root}?includes_parents=true&per_page=20&page=${page}`)
      if(!Array.isArray(rows)||rows.length>20)throw new ServiceUnavailableException('Current protection inventory unavailable')
      for(const row of rows)if(row.enforcement==='active') {
        if(!Number.isSafeInteger(row.id)||row.id<1)throw new ServiceUnavailableException('Invalid ruleset identity')
        const detail=await reader.request<Record<string,any>>(`${root}/${row.id}?includes_parents=true`)
        if(!Array.isArray(detail.rules))throw new ServiceUnavailableException('Protection rules unavailable')
        if(detail.rules.some((rule:Record<string,any>)=>rule.type==='merge_queue'))throw new ConflictException('Merge queue protection is enabled. Managed readiness gates do not support merge queues yet')
      }
      if(rows.length<20)return
    }
    throw new ServiceUnavailableException('Protection inventory exceeds the safe activation limit')
  }

  async readRepositoryRuleSuites(installationId:bigint,repositoryId:bigint,options:{page:number;period:string;ref?:string;actor?:string}) {
    if(!Number.isInteger(options.page)||options.page<1||options.page>1000||!['hour','day','week','month'].includes(options.period))throw new BadRequestException('Invalid evaluation history page')
    const installation=await this.verifyInstallation(installationId)
    if(!['read','write'].includes(installation.permissions.administration))throw new ForbiddenException('Ruleset Insights needs repository Administration: read permission on the assessment App')
    const reader=await this.openRepository(installationId,repositoryId,'administration')
    const root=`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/rulesets/rule-suites`
    const params=new URLSearchParams({per_page:'20',page:String(options.page),time_period:options.period,rule_suite_result:'all',evaluate_status:'all'})
    if(options.ref)params.set('ref',options.ref)
    if(options.actor)params.set('actor_name',options.actor)
    const rows=await reader.request<Record<string,any>[]>(`${root}?${params}`)
    if(!Array.isArray(rows)||rows.length>20||new Set(rows.map(row=>row.id)).size!==rows.length)throw new ServiceUnavailableException('Invalid GitHub evaluation history')
    const details:Record<string,any>[]=[]
    for(const row of rows) {
      if(!Number.isSafeInteger(row.id)||row.id<1||String(row.repository_id)!==repositoryId.toString())throw new ServiceUnavailableException('GitHub evaluation scope changed')
      const detail=await reader.request<Record<string,any>>(`${root}/${row.id}`)
      if(detail.id!==row.id)throw new ServiceUnavailableException('GitHub evaluation identity changed')
      details.push(detail)
    }
    return {details,hasMore:rows.length===20&&options.page<1000,fetchedAt:new Date().toISOString(),repositoryName:reader.metadata.full_name}
  }

  async readRulesetInsights(installationId:bigint,repositoryId:bigint,rulesetId:number,options:{page:number;period:string;ref?:string;actor?:string;result?:string}) {
    const page=await this.readRepositoryRuleSuites(installationId,repositoryId,options)
    const suites:RulesetSuite[]=[]
    for(const detail of page.details) {
      const match=attributedSuite(detail,repositoryId.toString(),rulesetId)
      if(match) {
        const rules=options.result&&options.result!=='all'?match.rules.filter(rule=>rule.result===options.result):match.rules
        if(rules.length)suites.push({...match,rules})
      }
    }
    return {source:'GITHUB_RULE_SUITES',scope:'CURRENT_GITHUB_PAGE',counting:'MATCHED_RULE_OCCURRENCES',page:options.page,period:options.period,hasMore:page.hasMore,scannedSuites:page.details.length,suites,summary:summarizeRulesetSuites(suites),fetchedAt:page.fetchedAt,repositoryName:page.repositoryName,rulesetId}
  }

  async verifyReadinessBranch(installationId: bigint, repositoryId: bigint, branch: string) {
    if(!validProfileBranch(branch))throw new BadRequestException('Invalid branch')
    const reader=await this.openRepository(installationId,repositoryId,'contents')
    const ref=await reader.request<Record<string,any>>(`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/git/ref/heads/${encodeURIComponent(branch)}`)
    if(ref.ref!==`refs/heads/${branch}` || ref.object?.type!=='commit' || !/^[a-f0-9]{40}$/.test(ref.object?.sha))throw new ServiceUnavailableException('Branch could not be verified')
    return ref.object.sha as string
  }

  async readOpenReadinessPullRequests(installationId: bigint, repositoryId: bigint) {
    const reader=await this.openRepository(installationId,repositoryId,'pull_requests')
    const rows=await reader.request<Record<string,any>[]>(`/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/pulls?state=open&per_page=100`)
    if(!Array.isArray(rows) || rows.length>=100)throw new ServiceUnavailableException('Open pull request scope exceeds the safe activation limit')
    if(rows.some(row=>!Number.isSafeInteger(row.number)||row.number<1||!/^[a-f0-9]{40}$/.test(row.head?.sha)||String(row.base?.repo?.id)!==repositoryId.toString()||!validProfileBranch(row.base?.ref)))throw new ServiceUnavailableException('Invalid open pull request identity')
    return rows.map(row=>({number:row.number,headSha:row.head?.sha,headRepositoryId:String(row.head?.repo?.id),baseBranch:row.base?.ref,draft:row.draft===true}))
  }

  /** Publish advisory comments only at verified changed lines on the exact PR revision. */
  async publishAiInlineReview(installationId: bigint, repositoryId: bigint, source: import('../intelligence/pr-review-context.js').PrReviewSource, key: string, findings: {summary:string;recommendation:string;evidenceRefs:string[]}[]) {
    if (!/^[a-f0-9]{64}$/.test(key) || findings.length > 20) throw new BadRequestException('Invalid AI review');
    const safe = (s:string) => s.replace(/[\`*_<>#@\[\]]/g,'');
    const comments = findings.flatMap(f=> {
      const line = source.lines.find(l=>f.evidenceRefs.includes(l.ref));
      return line ? [{path:line.path,line:line.line,side:line.side,body:`Advisory AI suggestion\n\n${safe(f.summary)}\n\n${safe(f.recommendation)}`}]:[];
    });
    if (!comments.length) return null;
    const before = await this.readPullRequest(installationId, repositoryId, source.number);
    if (!sameReviewPr(source.context,before.context)) throw new ConflictException('PR changed before inline feedback');
    const reader = await this.openRepository(installationId,repositoryId,'metadata');
    const auth = await this.appRequest('POST /app/installations/{installation_id}/access_tokens',{installation_id:Number(installationId),repository_ids:[Number(repositoryId)],permissions:{metadata:'read',pull_requests:'write'}});
    const app = (await this.appRequest('GET /app',{})).data;
    if (!auth.data.token || typeof app.slug !== 'string') throw new ServiceUnavailableException('GitHub review credentials unavailable');
    const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/pulls/${source.number}`;
    const call = async (path:string, body?:unknown) => {
      const response = await this.apiFetch(`installation:${installationId}`,`https://api.github.com${path}`,{method:body===undefined?'GET':'POST',headers:{...this.apiHeaders(auth.data.token),...(body===undefined?{}:{'Content-Type':'application/json'})},signal:AbortSignal.timeout(10000),...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok) throw new ServiceUnavailableException('GitHub inline feedback unavailable');
      return response.json() as Promise<any>;
    };
    const body = `Advisory AI review; does not approve or block merging.\n\n<!-- preflyt-ai:${key} -->`;
    const matches = (r:any)=>r.body===body && r.commit_id===source.context.head.sha && r.state==='COMMENTED' && r.user?.login===`${app.slug}[bot]` && r.user?.type==='Bot' && typeof r.html_url==='string' && r.html_url.startsWith('https://github.com/');
    let existing:any;
    for(let page=1;page<=3;page++) {
      const reviews=await call(`${root}/reviews?per_page=100&page=${page}`);
      if(!Array.isArray(reviews)||reviews.length>100)throw new ServiceUnavailableException('Invalid review history');
      existing=reviews.find(matches);if(existing)break;
      if(reviews.length<100)break;
      if(page===3)throw new ServiceUnavailableException('Review history exceeds publication limit');
    }
    const id = existing?.id ?? (await call(`${root}/reviews`,{commit_id:source.context.head.sha,event:'COMMENT',body,comments})).id;
    if(!Number.isSafeInteger(id)||id<1)throw new ServiceUnavailableException('Invalid review receipt');
    const observed=await call(`${root}/reviews/${id}`);
    if(!matches(observed))throw new ConflictException('GitHub inline review changed');
    // The review-comments listing exposes legacy diff positions; fetch each bounded
    // comment receipt for GitHub's authoritative line/side and review identity.
    const listedComments=await call(`${root}/reviews/${id}/comments?per_page=100`);
    if(!Array.isArray(listedComments)||listedComments.length!==comments.length||listedComments.some((v:any)=>!Number.isSafeInteger(v.id)||v.id<1)||new Set(listedComments.map((v:any)=>v.id)).size!==listedComments.length)throw new ConflictException('GitHub inline comments changed');
    const observedComments: Record<string,any>[]=[];
    for(const listed of listedComments) observedComments.push(await call(`${root.replace(/\/pulls\/\d+$/,'')}/pulls/comments/${listed.id}`));
    if(!comments.every(c=>observedComments.some((v:any)=>v.pull_request_review_id===id && v.commit_id===source.context.head.sha && v.user?.login===`${app.slug}[bot]` && v.user?.type==='Bot' && v.path===c.path && v.line===c.line && v.side===c.side && v.body===c.body)))throw new ConflictException('GitHub inline comments changed');
    const after = await this.readPullRequest(installationId,repositoryId,source.number);
    if(!sameReviewPr(source.context,after.context))throw new ConflictException('PR changed during inline feedback');
    return {htmlUrl:observed.html_url as string,reviewId:String(id)};
  }

  async publishAiReviewSummary(installationId: bigint, repositoryId: bigint, sourceSha: string, externalId: string, summary: string) {
    if (summary.length > 60000) throw new BadRequestException('AI summary exceeds limit')
    return this.publishReadinessCheck(installationId, repositoryId, {name:'Preflyt / AI Review',head_sha:sourceSha,external_id:externalId,status:'completed',conclusion:'neutral',output:{title:'Advisory AI review — does not decide merge readiness',summary}},false,true,true)
  }

  async readPrReviewSource(installationId: bigint, repositoryId: bigint, number: number, expected: PullRequestContext) {
    const before = await this.readPullRequest(installationId, repositoryId, number)
    if (!sameReviewPr(expected, before.context) || expected.base.repositoryId !== repositoryId.toString()) throw new ConflictException('PR changed before source review')
    const reader = await this.openRepository(installationId, repositoryId, 'pull_requests')
    const root = `/repos/${encodeURIComponent(reader.metadata.owner.login)}/${encodeURIComponent(reader.metadata.name)}/pulls/${number}`
    const files: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const rows = await reader.request<unknown[]>(`${root}/files?per_page=100&page=${page}`)
      if (!Array.isArray(rows) || rows.length > 100) throw new ServiceUnavailableException('PR files unavailable')
      files.push(...rows)
      if (files.length > 200) throw new ServiceUnavailableException('PR exceeds 200-file source review limit')
      if (rows.length < 100) break
    }
    const after = await this.readPullRequest(installationId, repositoryId, number)
    if (!sameReviewPr(expected, after.context)) throw new ConflictException('PR changed while reading source')
    return prReviewSource(number, expected, files)
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
    permission: 'contents' | 'pull_requests' | 'metadata' | 'actions' | 'checks' | 'administration' = 'contents',
    externalSignal?: AbortSignal,
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
    const timeout = AbortSignal.timeout(60_000)
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout
    signal.throwIfAborted()
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
    const privateKey = configurationValue('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n')
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
    const appId = configurationValue('GITHUB_APP_ID')
    if (!appId || !/^\d+$/.test(appId)) {
      throw new ServiceUnavailableException('GitHub App is not configured')
    }
    return appId
  }

  private requireClientId() {
    const clientId = configurationValue('GITHUB_APP_CLIENT_ID')
    if (!clientId)
      throw new ServiceUnavailableException('GitHub App is not configured')
    return clientId
  }

  private requireClientSecret() {
    const clientSecret = configurationValue('GITHUB_APP_CLIENT_SECRET')
    if (!clientSecret)
      throw new ServiceUnavailableException('GitHub App is not configured')
    return clientSecret
  }

  private requireCallbackUrl() {
    const callback = configurationValue('GITHUB_APP_OAUTH_CALLBACK_URL')
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
