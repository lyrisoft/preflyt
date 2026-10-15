import { afterEach, expect, it, vi } from 'vitest'
import { createFirstReport } from './create-first-report'

const sha = 'a'.repeat(40)
const standards = {
  selection: null,
  selectionIntegrity: true,
  profileSnapshot: { sourceSha: sha, complete: true },
  recommendations: [
    { id: 'baseline', version: '1.1.0', reason: 'Core checks' },
  ],
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())
it('inspects once, adopts recommendations and creates a commit-bound report without manual mappings', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({ ...standards, profileSnapshot: null }))
    .mockResolvedValueOnce(reply({}))
    .mockResolvedValueOnce(reply(standards))
    .mockResolvedValueOnce(reply({ id: 'selection' }))
    .mockResolvedValueOnce(reply({ assessment: { id: 'report' } }))
  vi.stubGlobal('fetch', fetch)
  const progress = vi.fn()
  expect(await createFirstReport('123', () => 'retry-key', progress)).toEqual({
    assessment: { id: 'report' },
  })
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/github/repositories/123/standards',
    '/github/repositories/123/profile',
    '/github/repositories/123/standards',
    '/github/repositories/123/standards',
    '/github/repositories/123/assessments',
  ])
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
    profile: 'RECOMMENDED',
    expectedSelectionId: null,
    packs: [{ id: 'baseline', version: '1.1.0' }],
  })
  expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({
    sourceSha: sha,
    expectedSelectionId: 'selection',
    requestKey: 'retry-key',
    mappings: [],
  })
  expect(progress).toHaveBeenCalledWith('Inspecting repository configuration…')
})
it('preserves existing standards and reuses a retry key for the same assessment inputs', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({ ...standards, selection: { id: 'custom' } }))
    .mockResolvedValueOnce(reply({ assessment: { id: 'report' } }))
  vi.stubGlobal('fetch', fetch)
  const key = vi.fn(() => 'same-key')
  await createFirstReport('123', key, vi.fn())
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(key).toHaveBeenCalledWith(`${sha}:custom`)
  expect(JSON.parse(fetch.mock.calls[1][1].body).expectedSelectionId).toBe(
    'custom'
  )
})
it('stops on concurrent standard changes instead of overwriting or creating a report', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply(standards))
    .mockResolvedValueOnce(reply({}, 409))
  vi.stubGlobal('fetch', fetch)
  await expect(createFirstReport('123', () => 'key', vi.fn())).rejects.toThrow(
    'settings changed'
  )
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('does not continue after authorization loss or failed inspection', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({}, 403))
  vi.stubGlobal('fetch', fetch)
  await expect(createFirstReport('123', () => 'key', vi.fn())).rejects.toThrow(
    'access changed'
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch
    .mockReset()
    .mockResolvedValueOnce(reply({ ...standards, profileSnapshot: null }))
    .mockResolvedValueOnce(reply({}, 503))
  await expect(createFirstReport('123', () => 'key', vi.fn())).rejects.toThrow(
    'Saved progress is kept'
  )
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('rejects unverified saved standard versions before assessment creation', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(
    reply({
      ...standards,
      selection: { id: 'old' },
      selectionIntegrity: false,
    })
  )
  vi.stubGlobal('fetch', fetch)
  await expect(createFirstReport('123', () => 'key', vi.fn())).rejects.toThrow(
    'saved standard versions'
  )
  expect(fetch).toHaveBeenCalledTimes(1)
})
