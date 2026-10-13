import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  GitHubIdentityProvider,
  githubLoginCallback,
} from '../src/auth/github-identity-provider.js'
import type { GitHubProviderService } from '../src/github/github-provider.service.js'
const app = {
  verifyInstallation: vi.fn(async () => ({
    id: 41n,
    accountId: 201n,
    accountType: 'Organization',
    accountLogin: 'fixture',
    repositorySelection: 'selected',
    permissions: {},
  })),
}
const provider = () =>
  new GitHubIdentityProvider(app as unknown as GitHubProviderService)
beforeEach(() => {
  vi.stubEnv('GITHUB_APP_ID', '999')
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'client')
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'secret')
  vi.stubEnv(
    'GITHUB_LOGIN_CALLBACK_URL',
    'http://localhost:3000/auth/github/callback',
  )
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
it('uses a separate callback with state, S256 PKCE and expiring credentials', async () => {
  const p = provider(),
    url = new URL(p.authorizationUrl('state', 'challenge'))
  expect(url.searchParams.get('redirect_uri')).toBe(
    'http://localhost:3000/auth/github/callback',
  )
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('scope')).toBe('offline_access')
  const fetcher = vi.fn(async () =>
    response({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    }),
  )
  vi.stubGlobal('fetch', fetcher)
  expect(await p.exchange('code', 'verifier')).toMatchObject({
    accessToken: 'access',
    refreshToken: 'refresh',
  })
  const form = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
    .body as URLSearchParams
  expect(form.get('code_verifier')).toBe('verifier')
  expect(form.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'))
})
it('rejects unexpiring tokens and never accepts browser-supplied identity', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({ access_token: 'access', token_type: 'bearer' }),
    ),
  )
  await expect(provider().exchange('code', 'verifier')).rejects.toThrow(
    'expiring',
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response({ id: 101, login: 'fixture', type: 'Bot' })),
  )
  await expect(provider().user('token')).rejects.toThrow('user account')
})
it('verifies user, App, organization, active membership and accessible repositories', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/user/installations?'))
      return response({
        installations: [
          {
            id: 41,
            app_id: 999,
            account: { id: 201, type: 'Organization', login: 'fixture' },
          },
        ],
      })
    if (url.includes('/memberships/'))
      return response({
        state: 'active',
        role: 'admin',
        organization: { id: 201 },
        user: { id: 101 },
      })
    return response({ repositories: [{ id: 11 }] })
  })
  vi.stubGlobal('fetch', fetcher)
  expect(await provider().verify('token', 41n, 101n)).toMatchObject({
    organizationId: 201n,
    owner: true,
    repositoryIds: [11n],
  })
  app.verifyInstallation.mockResolvedValueOnce({
    ...(await app.verifyInstallation()),
    accountId: 202n,
  })
  await expect(provider().verify('token', 41n, 101n)).rejects.toThrow(
    'identity',
  )
})
it('does not admit foreign App installations or pending organization membership', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({
        installations: [
          {
            id: 41,
            app_id: 1000,
            account: { id: 201, type: 'Organization', login: 'fixture' },
          },
        ],
      }),
    ),
  )
  await expect(provider().verify('token', 41n, 101n)).rejects.toThrow(
    'not available',
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/installations?')
        ? response({
            installations: [
              {
                id: 41,
                app_id: 999,
                account: { id: 201, type: 'Organization', login: 'fixture' },
              },
            ],
          })
        : response({
            state: 'pending',
            role: 'member',
            organization: { id: 201 },
            user: { id: 101 },
          }),
    ),
  )
  await expect(provider().verify('token', 41n, 101n)).rejects.toThrow('Active')
})
it('rejects unsafe callback configuration', () => {
  for (const url of [
    'https://evil.test/wrong',
    'http://evil.test/auth/github/callback',
    'https://example.test/auth/github/callback?x=y',
  ]) {
    vi.stubEnv('GITHUB_LOGIN_CALLBACK_URL', url)
    expect(() => githubLoginCallback()).toThrow()
  }
})

it('paginates organization members and excludes bots from role assignment candidates', async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    login: `member-${i}`,
    type: i === 0 ? 'Bot' : 'User',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
  }))
  const fetcher = vi.fn(async (url: string) =>
    response(
      new URL(url).searchParams.get('page') === '1'
        ? first
        : [{ id: 1001, login: 'last-member', type: 'User' }],
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  const members = await provider().members('directory-token', 'fixture-org')
  expect(members).toHaveLength(100)
  expect(members.some((m) => m.id === '1')).toBe(false)
  expect(members.some((m) => m.login === 'last-member')).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[0]![0]).toContain(
    '/orgs/fixture-org/members?filter=all&role=all&per_page=100',
  )
})
it('rejects an unavailable member list instead of showing an empty successful sync', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response({}, 403)),
  )
  await expect(
    provider().members('unavailable-directory-token', 'fixture-org'),
  ).rejects.toThrow('verified')
})

it('reports missing organization Members permission with an actionable error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('{}', {
          status: 403,
          headers: { 'x-accepted-github-permissions': 'members=read' },
        }),
    ),
  )
  await expect(
    provider().members('permission-token', 'fixture'),
  ).rejects.toThrow('Members: Read-only')
})
it('turns request and response-body timeouts into retryable service errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new DOMException('expired', 'TimeoutError')
    }),
  )
  await expect(provider().user('timeout-token')).rejects.toMatchObject({
    status: 503,
  })
  await expect(provider().exchange('code', 'verifier')).rejects.toMatchObject({
    status: 503,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => {
        throw new DOMException('expired', 'TimeoutError')
      },
    })),
  )
  await expect(provider().user('body-timeout-token')).rejects.toMatchObject({
    status: 503,
  })
})

it('rotates expiring GitHub credentials with the OAuth refresh grant', async () => {
  const fetcher = vi.fn(async () => response({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'bearer', expires_in: 28800, refresh_token_expires_in: 15897600 }))
  vi.stubGlobal('fetch', fetcher)
  expect(await provider().refresh('old-refresh')).toMatchObject({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' })
  const form = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams
  expect(form.get('grant_type')).toBe('refresh_token')
  expect(form.get('refresh_token')).toBe('old-refresh')
  expect(form.has('code')).toBe(false)
})
it('distinguishes revoked refresh credentials from transient provider failures without leaking tokens', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'bad_refresh_token', error_description: 'secret-token' })))
  await expect(provider().refresh('secret-token')).rejects.toThrow('revoked')
  vi.stubGlobal('fetch', vi.fn(async () => response({}, 503)))
  await expect(provider().refresh('secret-token')).rejects.toThrow('temporarily unavailable')
  vi.stubGlobal('fetch', vi.fn(async () => response({ access_token: 'secret-token', expires_in: '28800' })))
  await expect(provider().refresh('secret-token')).rejects.toThrow('invalid token refresh response')
})
