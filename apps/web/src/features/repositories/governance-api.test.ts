import { afterEach, expect, it, vi } from 'vitest'
import { governanceRequest } from './governance-api'

afterEach(() => vi.unstubAllGlobals())
it('preserves GitHub cooldown metadata for the retry UI', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: 'GitHub requests are temporarily paused.',
            code: 'GITHUB_RATE_LIMITED',
            retryAt: '2026-10-18T04:41:19.090Z',
            retryAfterSeconds: 507,
          }),
          { status: 503 }
        )
    )
  )
  await expect(
    governanceRequest('/github/repositories/1/pipeline-setup')
  ).rejects.toMatchObject({
    code: 'GITHUB_RATE_LIMITED',
    retryAt: '2026-10-18T04:41:19.090Z',
  })
})
it('does not forward an invalid retry timestamp', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: 'Unavailable',
            retryAt: 'invalid',
            retryAfterSeconds: -1,
          }),
          { status: 503 }
        )
    )
  )
  await expect(governanceRequest('/test')).rejects.toMatchObject({
    retryAt: undefined,
  })
})
it.each([30, 1e300])(
  'validates a seconds-only cooldown (%s)',
  async (seconds) => {
    const before = Date.now()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'Paused',
              code: 'GITHUB_RATE_LIMITED',
              retryAfterSeconds: seconds,
            }),
            { status: 503 }
          )
      )
    )
    try {
      await governanceRequest('/test')
      expect.fail('Expected a request error')
    } catch (error) {
      const result = error as Error & { retryAt?: string }
      expect(result.message).toBe('Paused')
      if (seconds === 30)
        expect(Date.parse(result.retryAt!)).toBeGreaterThanOrEqual(
          before + 30000
        )
      else expect(result.retryAt).toBeUndefined()
    }
  }
)
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
