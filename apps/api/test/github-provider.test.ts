import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GitHubProviderService', () => {
  it('revokes only the temporary user token, without revoking the app grant', async () => {
    vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.test-client')
    vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'test-client-secret')
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await new GitHubProviderService().revokeUserToken('ghu-temporary-token')

    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://api.github.com/applications/Iv1.test-client/token',
    )
    expect(options).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ access_token: 'ghu-temporary-token' }),
    })
  })
})
