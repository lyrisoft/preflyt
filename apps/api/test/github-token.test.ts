import { afterEach, it, expect, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
afterEach(() => vi.unstubAllEnvs())
it('reuses least-privilege tokens by exact repository scope, expires early and invalidates on access revisions', async () => {
  vi.stubEnv('GITHUB_APP_ID', '11')
  let revision = 0
  const prisma = {
    gitHubInstallation: {
      findUnique: async () => ({ accessRevision: revision }),
    },
  }
  const provider = new GitHubProviderService(undefined, prisma as any)
  const issue = vi.fn(async () => ({
    status: 201,
    data: {
      token: 'fixture-secret',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
    headers: {},
  }))
  ;(provider as any).app = { octokit: { request: issue } }
  ;(provider as any).appFingerprint = (provider as any).connectionFingerprint()
  await Promise.all([
    (provider as any).installationToken(1n, 2n),
    (provider as any).installationToken(1n, 2n),
  ])
  expect(issue).toHaveBeenCalledTimes(1)
  await (provider as any).installationToken(1n, 2n)
  expect(issue).toHaveBeenCalledTimes(1)
  await (provider as any).installationToken(1n, 3n)
  expect(issue).toHaveBeenCalledTimes(2)
  expect(issue.mock.calls[0][1]).toMatchObject({
    repository_ids: [2],
    permissions: { contents: 'read', metadata: 'read' },
  })
  revision++
  await (provider as any).installationToken(1n, 2n)
  expect(issue).toHaveBeenCalledTimes(3)
  for (const token of (provider as any).tokens.values())
    token.expiresAt = Date.now() + 1000
  await (provider as any).installationToken(1n, 2n)
  expect(issue).toHaveBeenCalledTimes(4)
})
