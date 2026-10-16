import { afterEach, expect, it, vi } from 'vitest'
import {
  createFirstReport,
  inspectFirstRepository,
  saveFirstStandards,
} from './create-first-report'

const sha = 'a'.repeat(40)
const standards = {
  selection: { id: 'custom' },
  selectionIntegrity: true,
  profileSnapshot: { sourceSha: sha, complete: true },
  recommendations: [
    { id: 'baseline', version: '1.1.0', reason: 'Core checks' },
  ],
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())
it('inspects only when explicitly requested and returns fresh progress without saving standards or creating assessments', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({}))
    .mockResolvedValueOnce(reply({ ...standards, selection: null }))
  vi.stubGlobal('fetch', fetch)
  await inspectFirstRepository('123')
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/github/repositories/123/profile',
    '/github/repositories/123/standards',
  ])
  expect(fetch.mock.calls[0][1].method).toBe('POST')
  expect(fetch.mock.calls[1][1].method).toBeUndefined()
})
it('saves only explicitly selected standards and protects against overwriting concurrent selections', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({ id: 'selection' }))
    .mockResolvedValueOnce(reply(standards))
  vi.stubGlobal('fetch', fetch)
  await saveFirstStandards('123', [{ id: 'baseline', version: '1.1.0' }])
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    profile: 'RECOMMENDED',
    expectedSelectionId: null,
    packs: [{ id: 'baseline', version: '1.1.0' }],
  })
  expect(fetch.mock.calls).toHaveLength(2)
  fetch.mockReset().mockResolvedValueOnce(reply({}, 409))
  await expect(
    saveFirstStandards('123', [{ id: 'baseline', version: '1.1.0' }])
  ).rejects.toThrow('settings changed')
  expect(fetch.mock.calls).toHaveLength(1)
})
it('rejects an empty standards selection without a request', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(saveFirstStandards('123', [])).rejects.toThrow(
    'Choose at least one'
  )
  expect(fetch).not.toHaveBeenCalled()
})
it('creates a commit-bound assessment with existing standards and a stable retry key', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply(standards))
    .mockResolvedValueOnce(reply({ assessment: { id: 'report' } }))
  vi.stubGlobal('fetch', fetch)
  const key = vi.fn(() => 'same-key')
  expect(await createFirstReport('123', key, vi.fn())).toEqual({
    assessment: { id: 'report' },
  })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(key).toHaveBeenCalledWith(`${sha}:custom`)
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    sourceSha: sha,
    expectedSelectionId: 'custom',
    requestKey: 'same-key',
    mappings: [],
  })
})
it('does not silently inspect or adopt recommendations when prerequisite steps are missing', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const [data, message] of [
    [{ ...standards, profileSnapshot: null }, 'Inspect the repository'],
    [{ ...standards, selection: null }, 'Review and save standards'],
    [{ ...standards, selectionIntegrity: false }, 'saved standard versions'],
  ] as const) {
    fetch.mockReset().mockResolvedValueOnce(reply(data))
    await expect(
      createFirstReport('123', () => 'key', vi.fn())
    ).rejects.toThrow(message)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].method).toBeUndefined()
  }
})
it('stops on access loss and inspection failure', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({}, 403))
  vi.stubGlobal('fetch', fetch)
  await expect(createFirstReport('123', () => 'key', vi.fn())).rejects.toThrow(
    'access changed'
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockReset().mockResolvedValueOnce(reply({}, 503))
  await expect(inspectFirstRepository('123')).rejects.toThrow(
    'Saved progress is kept'
  )
  expect(fetch).toHaveBeenCalledTimes(1)
})
