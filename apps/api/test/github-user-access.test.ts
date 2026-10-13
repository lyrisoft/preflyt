import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
afterEach(() => vi.unstubAllGlobals())
describe('installing-user installation access', () => {
  it('accepts an installation listed for the authorizing user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ installations: [{ id: 8800 }] })),
      ),
    )
    await expect(
      new GitHubProviderService().userCanAccessInstallation(
        'fixture-token',
        8800n,
      ),
    ).resolves.toBeUndefined()
  })
  it('rejects another installation and an empty list instead of authorizing at end of pagination', async () => {
    for (const installations of [[{ id: 8801 }], []]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ installations }))),
      )
      await expect(
        new GitHubProviderService().userCanAccessInstallation(
          'fixture-token',
          8800n,
        ),
      ).rejects.toThrow('cannot access this installation')
    }
  })
})
