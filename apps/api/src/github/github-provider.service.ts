import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { App } from '@octokit/app'

export type GitHubInstallationInfo = {
  id: bigint
  accountLogin: string
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

  async verifyInstallation(installationId: bigint) {
    let data
    try {
      const response = await this.requireApp().octokit.request(
        'GET /app/installations/{installation_id}',
        { installation_id: Number(installationId) },
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
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
      signal: AbortSignal.timeout(10_000),
    })
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
      const response = await fetch(url, {
        headers: this.apiHeaders(userToken),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('Unable to verify GitHub installation owner')
      const body = (await response.json()) as {
        installations?: Array<{ id?: number }>
      }
      const installations = body.installations ?? []
      if (installations.some((installation) => BigInt(installation.id ?? 0) === installationId)) {
        return
      }
      if (installations.length < 100) return
    }
    throw new Error('GitHub installation list exceeded the safe pagination limit')
  }

  async revokeUserToken(userToken: string) {
    const credentials = Buffer.from(
      `${this.requireClientId()}:${this.requireClientSecret()}`,
    ).toString('base64')
    const response = await fetch(
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

  async listInstallationRepositories(installationId: bigint) {
    let token
    try {
      const response = await this.requireApp().octokit.request(
        'POST /app/installations/{installation_id}/access_tokens',
        {
          installation_id: Number(installationId),
          permissions: { metadata: 'read', contents: 'read' },
        },
      )
      token = response.data
    } catch (error) {
      if (this.isNotFound(error)) throw new GitHubInstallationRevokedError()
      throw error
    }
    const repositories: GitHubRepositoryInfo[] = []
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL('https://api.github.com/installation/repositories')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))
      const response = await fetch(url, {
        headers: this.apiHeaders(token.token),
        signal: AbortSignal.timeout(10_000),
      })
      if (response.status === 404) throw new GitHubInstallationRevokedError()
      if (!response.ok) throw new Error('Unable to list GitHub installation repositories')
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
    if (!privateKey) throw new ServiceUnavailableException('GitHub App is not configured')
    this.app = new App({
      appId,
      privateKey,
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
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
    if (!clientId) throw new ServiceUnavailableException('GitHub App is not configured')
    return clientId
  }

  private requireClientSecret() {
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET
    if (!clientSecret) throw new ServiceUnavailableException('GitHub App is not configured')
    return clientSecret
  }

  private requireCallbackUrl() {
    const callback = process.env.GITHUB_APP_OAUTH_CALLBACK_URL
    if (!callback) throw new ServiceUnavailableException('GitHub App is not configured')
    const url = new URL(callback)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new ServiceUnavailableException('GitHub callback URL must use HTTPS')
    }
    return url.href
  }
}
