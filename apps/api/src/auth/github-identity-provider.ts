import { configurationValue } from '../configuration/runtime-configuration.js'
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { GitHubProviderService } from '../github/github-provider.service.js'
import {
  GitHubRateLimitError,
  GitHubRequestLimiter,
} from '../github/github-rate-limit.js'
import { RedisCacheService } from '../cache/redis-cache.service.js'

export function githubLoginEnabled() {
  return configurationValue('GITHUB_LOGIN_ENABLED') === 'true'
}
export function githubLoginCallback() {
  const raw = configurationValue('GITHUB_LOGIN_CALLBACK_URL')
  if (!raw)
    throw new Error(
      'GITHUB_LOGIN_CALLBACK_URL is required when GitHub login is enabled',
    )
  const url = new URL(raw)
  if (
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !['/auth/github/callback', '/api/auth/github/callback'].includes(
      url.pathname,
    ) ||
    (url.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new Error(
      'GitHub login callback must be an HTTPS /auth/github/callback URL (HTTP localhost is allowed in development)',
    )
  return url.href
}
function providerId(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new ServiceUnavailableException(
      'GitHub returned an invalid account ID',
    )
  return BigInt(value)
}
export type UserInstallation = {
  id: bigint
  organizationId: bigint
  login: string
}
@Injectable()
export class GitHubIdentityProvider {
  private readonly limiter: GitHubRequestLimiter
  constructor(
    @Inject(GitHubProviderService) private readonly app: GitHubProviderService,
    @Optional() @Inject(RedisCacheService) cache?: RedisCacheService,
  ) {
    this.limiter = new GitHubRequestLimiter(cache)
  }
  private async request<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof GitHubRateLimitError) throw error
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      )
        throw new ServiceUnavailableException(
          'GitHub took too long to respond. Try again. Your workspace has not been changed.',
        )
      throw error
    }
  }
  authorizationUrl(state: string, challenge: string) {
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', configurationValue('GITHUB_APP_CLIENT_ID')!)
    url.searchParams.set('redirect_uri', githubLoginCallback())
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('scope', 'offline_access')
    url.searchParams.set('allow_signup', 'false')
    return url.href
  }
  async exchange(code: string, verifier: string) {
    const response = await this.request(() =>
      this.limiter.run(
        `oauth:${configurationValue('GITHUB_APP_CLIENT_ID')}`,
        () =>
          fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: configurationValue('GITHUB_APP_CLIENT_ID')!,
              client_secret: configurationValue('GITHUB_APP_CLIENT_SECRET')!,
              redirect_uri: githubLoginCallback(),
              code,
              code_verifier: verifier,
            }),
            signal: AbortSignal.timeout(10000),
          }),
        false,
      ),
    )
    if (!response.ok)
      throw new ServiceUnavailableException(
        'GitHub sign-in could not be completed',
      )
    const data = (await this.request(() => response.json())) as Record<
      string,
      unknown
    >
    if (
      data.error ||
      typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string' ||
      data.token_type !== 'bearer' ||
      typeof data.expires_in !== 'number' ||
      !Number.isInteger(data.expires_in) ||
      data.expires_in < 60 ||
      data.expires_in > 28800 ||
      typeof data.refresh_token_expires_in !== 'number' ||
      !Number.isInteger(data.refresh_token_expires_in) ||
      data.refresh_token_expires_in < data.expires_in ||
      data.refresh_token_expires_in > 15897600
    )
      throw new ForbiddenException(
        'GitHub did not issue expiring user credentials. Enable expiring user tokens for the App.',
      )
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      refreshExpiresAt: new Date(
        Date.now() + data.refresh_token_expires_in * 1000,
      ),
    }
  }
  async refresh(refreshToken: string) {
    const response = await this.request(() => this.limiter.run(
      `oauth:${configurationValue('GITHUB_APP_CLIENT_ID')}`,
      () => fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: configurationValue('GITHUB_APP_CLIENT_ID')!,
          client_secret: configurationValue('GITHUB_APP_CLIENT_SECRET')!, grant_type: 'refresh_token', refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10000),
      }), false,
    ))
    if (!response.ok) throw new ServiceUnavailableException('GitHub token refresh is temporarily unavailable. Try again.')
    const data = await this.request(() => response.json()) as Record<string, unknown>
    if (['bad_refresh_token', 'bad_verification_code', 'expired_token'].includes(String(data.error)))
      throw new ForbiddenException('GitHub authorization has expired or was revoked. Sign in with GitHub again.')
    if (data.error || typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 8192 ||
        typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 8192 || data.token_type !== 'bearer' ||
        !Number.isInteger(data.expires_in) || Number(data.expires_in) < 60 || Number(data.expires_in) > 28800 ||
        !Number.isInteger(data.refresh_token_expires_in) || Number(data.refresh_token_expires_in) < Number(data.expires_in) ||
        Number(data.refresh_token_expires_in) > 15897600)
      throw new ServiceUnavailableException('GitHub returned an invalid token refresh response. Try again.')
    return { accessToken: data.access_token, refreshToken: data.refresh_token,
      accessExpiresAt: new Date(Date.now() + Number(data.expires_in) * 1000),
      refreshExpiresAt: new Date(Date.now() + Number(data.refresh_token_expires_in) * 1000) }
  }
  private async get(token: string, path: string) {
    const response = await this.request(() =>
      this.limiter.run(`user:${token}`, () =>
        fetch('https://api.github.com' + path, {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28',
          },
          signal: AbortSignal.timeout(10000),
        }),
      ),
    )
    if (
      response.status === 403 &&
      response.headers
        .get('x-accepted-github-permissions')
        ?.includes('members=read')
    )
      throw new ForbiddenException(
        'The GitHub App needs Organization permissions → Members: Read-only. A GitHub organization owner must approve the updated installation permissions, then sign in again.',
      )
    if ([401, 403, 404].includes(response.status))
      throw new ForbiddenException(
        'GitHub access could not be verified. Check your organization access and sign in again.',
      )
    if (!response.ok)
      throw new ServiceUnavailableException(
        'GitHub access verification is temporarily unavailable. Try again.',
      )
    return this.request(() => response.json())
  }
  async user(token: string) {
    const data = await this.get(token, '/user')
    if (data.type !== 'User' || typeof data.login !== 'string' || !data.login)
      throw new ForbiddenException('A GitHub user account is required')
    return {
      id: providerId(data.id),
      login: data.login,
      displayName: typeof data.name === 'string' ? data.name : null,
      avatarUrl:
        typeof data.avatar_url === 'string' &&
        data.avatar_url.startsWith('https://avatars.githubusercontent.com/')
          ? data.avatar_url
          : null,
    }
  }
  async installations(token: string): Promise<UserInstallation[]> {
    const result: UserInstallation[] = []
    for (let page = 1; page <= 20; page++) {
      const data = await this.get(
        token,
        `/user/installations?per_page=100&page=${page}`,
      )
      if (!Array.isArray(data.installations))
        throw new ServiceUnavailableException(
          'GitHub organization list is unavailable',
        )
      for (const item of data.installations)
        if (
          String(item.app_id) === configurationValue('GITHUB_APP_ID') &&
          !item.suspended_at &&
          item.account?.type === 'Organization' &&
          typeof item.account.login === 'string'
        )
          result.push({
            id: providerId(item.id),
            organizationId: providerId(item.account.id),
            login: item.account.login,
          })
      if (data.installations.length < 100) return result
    }
    throw new ServiceUnavailableException(
      'GitHub organization list is too large. Contact your administrator.',
    )
  }
  async installationMembers(installationId: bigint, organizationId: bigint) {
    return this.app.withOrganizationMembers(
      installationId,
      organizationId,
      (token, login) => this.members(token, login),
    )
  }
  async resolveInstallationMember(
    installationId: bigint,
    organizationId: bigint,
    username: string,
  ) {
    return this.app.withOrganizationMembers(
      installationId,
      organizationId,
      (token, login) =>
        this.resolveMember(token, login, organizationId, username),
    )
  }
  async members(token: string, organizationLogin: string) {
    const members = new Map<
      string,
      { id: string; login: string; avatarUrl: string | null }
    >()
    for (let page = 1; page <= 100; page++) {
      const data = await this.get(
        token,
        `/orgs/${encodeURIComponent(organizationLogin)}/members?filter=all&role=all&per_page=100&page=${page}`,
      )
      if (!Array.isArray(data))
        throw new ServiceUnavailableException(
          'GitHub organization members could not be loaded',
        )
      for (const item of data) {
        if (item.type !== 'User') continue
        if (
          typeof item.login !== 'string' ||
          !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(item.login)
        )
          throw new ServiceUnavailableException(
            'GitHub returned an invalid member',
          )
        const id = providerId(item.id).toString()
        members.set(id, {
          id,
          login: item.login,
          avatarUrl:
            typeof item.avatar_url === 'string' &&
            item.avatar_url.startsWith('https://avatars.githubusercontent.com/')
              ? item.avatar_url
              : null,
        })
      }
      if (data.length < 100)
        return [...members.values()].sort((a, b) =>
          a.login.localeCompare(b.login),
        )
    }
    throw new ServiceUnavailableException(
      'GitHub organization exceeds the supported member sync limit',
    )
  }
  async resolveMember(
    token: string,
    organizationLogin: string,
    organizationId: bigint,
    username: string,
  ) {
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username))
      throw new ForbiddenException('Enter a valid GitHub username')
    const data = await this.get(token, `/users/${encodeURIComponent(username)}`)
    if (data.type !== 'User' || typeof data.login !== 'string')
      throw new ForbiddenException('Select a GitHub user account')
    const id = providerId(data.id)
    const membership = await this.get(
      token,
      `/orgs/${encodeURIComponent(organizationLogin)}/memberships/${encodeURIComponent(data.login)}`,
    )
    if (
      membership.state !== 'active' ||
      providerId(membership.organization?.id) !== organizationId ||
      providerId(membership.user?.id) !== id
    )
      throw new ForbiddenException(
        'The GitHub account must be an active member of this organization',
      )
    return {
      id,
      login: data.login as string,
      displayName: typeof data.name === 'string' ? data.name : null,
      avatarUrl:
        typeof data.avatar_url === 'string' &&
        data.avatar_url.startsWith('https://avatars.githubusercontent.com/')
          ? data.avatar_url
          : null,
    }
  }
  async verify(token: string, installationId: bigint, userId: bigint) {
    const found = (await this.installations(token)).find(
      (item) => item.id === installationId,
    )
    if (!found)
      throw new ForbiddenException(
        'This GitHub organization is not available to your account',
      )
    const installation = await this.request(() =>
      this.app.verifyInstallation(installationId),
    )
    if (
      installation.accountType !== 'Organization' ||
      installation.accountId !== found.organizationId ||
      installation.accountLogin.toLowerCase() !== found.login.toLowerCase()
    )
      throw new ForbiddenException(
        'GitHub organization identity could not be verified',
      )
    const member = await this.get(
      token,
      `/user/memberships/orgs/${encodeURIComponent(found.login)}`,
    )
    if (
      member.state !== 'active' ||
      !['admin', 'member'].includes(member.role) ||
      providerId(member.organization?.id) !== found.organizationId ||
      providerId(member.user?.id) !== userId
    )
      throw new ForbiddenException(
        'Active GitHub organization membership is required',
      )
    const repositoryIds: bigint[] = []
    for (let page = 1; page <= 100; page++) {
      const data = await this.get(
        token,
        `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
      )
      if (!Array.isArray(data.repositories))
        throw new ServiceUnavailableException(
          'GitHub repository access is unavailable',
        )
      repositoryIds.push(
        ...data.repositories.map((repo: { id: unknown }) =>
          providerId(repo.id),
        ),
      )
      if (data.repositories.length < 100)
        return {
          installation,
          organizationId: found.organizationId,
          login: found.login,
          owner: member.role === 'admin',
          repositoryIds: [...new Set(repositoryIds)],
        }
    }
    throw new ServiceUnavailableException(
      'GitHub repository access list exceeds the supported limit',
    )
  }
}
