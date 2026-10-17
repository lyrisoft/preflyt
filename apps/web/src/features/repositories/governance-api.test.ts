import { afterEach, expect, it, vi } from 'vitest'
import { governanceRequest } from './governance-api'

afterEach(() => vi.unstubAllGlobals())
it('keeps repository blocker details from a policy preview response', async () => {
  const blockedRepositories = [
    {
      repositoryId: '101',
      name: 'org/service',
      reason: 'NOT_SELECTED',
      message: 'Select this repository in Repositories.',
    },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: 'Cannot preview the organization baseline.',
            blockedRepositories,
          }),
          { status: 403 }
        )
    )
  )
  await expect(
    governanceRequest('/teams/organization/preview', {})
  ).rejects.toMatchObject({
    message: 'Cannot preview the organization baseline.',
    blockedRepositories,
  })
})
it('preserves ordinary request errors without inventing blocker details', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'The assignment changed.' }), {
          status: 409,
        })
    )
  )
  await expect(
    governanceRequest('/teams/team/assign', {})
  ).rejects.toMatchObject({
    message: 'The assignment changed.',
    blockedRepositories: [],
  })
})
