import { afterEach, expect, it, vi } from 'vitest'
import { importContributorActivity } from './import-activity'

const repositories = [
  { githubId: '11', fullName: 'org/one' },
  { githubId: '12', fullName: 'org/two' },
]
afterEach(() => vi.unstubAllGlobals())
it('imports the supplied authorized scope and preserves partial-history warnings', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ truncated: true }))
    .mockResolvedValueOnce(Response.json({ truncated: false }))
  vi.stubGlobal('fetch', fetcher)
  expect(await importContributorActivity(repositories)).toEqual({
    imported: ['org/one', 'org/two'],
    failures: [],
    truncated: true,
  })
  expect(
    fetcher.mock.calls.map(([url]) => url.split('/').slice(-2).join('/'))
  ).toEqual(['11/sync', '12/sync'])
  expect(fetcher.mock.calls[0][1]).toEqual({
    method: 'POST',
    credentials: 'include',
  })
})
it('reports permission failures and continues other repositories', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: 'Outside your scope' }, { status: 403 })
      )
      .mockResolvedValueOnce(Response.json({ truncated: false }))
  )
  expect(await importContributorActivity(repositories)).toEqual({
    imported: ['org/two'],
    failures: [{ repository: 'org/one', message: 'Outside your scope' }],
    truncated: false,
  })
})
it('retains cooldown messages and reports network errors without claiming success', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: 'Retry after five minutes' }, { status: 429 })
      )
      .mockRejectedValueOnce(new Error('Connection failed'))
  )
  const result = await importContributorActivity(repositories)
  expect(result.imported).toEqual([])
  expect(result.failures.map((item) => item.message)).toEqual([
    'Retry after five minutes',
    'Connection failed',
  ])
})
