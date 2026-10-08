import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  checkSession,
  SessionUnavailableError,
} from '../../web/src/lib/session-request.js'
const url = 'http://localhost:3000/auth/session'
const response = (authenticated: boolean) =>
  new Response(JSON.stringify({ authenticated }))
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it.each([true, false])(
  'returns only a confirmed authentication decision: %s',
  async (value) => {
    const fetch = vi.fn().mockResolvedValue(response(value))
    vi.stubGlobal('fetch', fetch)
    expect(await checkSession(url)).toEqual({ authenticated: value })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    })
    expect(vi.getTimerCount()).toBe(0)
  },
)
it('recovers from network and restart 503 failures without returning unauthenticated', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('connection failed'))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(response(true))
  vi.stubGlobal('fetch', fetch)
  const pending = checkSession(url)
  await vi.runAllTimersAsync()
  expect(await pending).toEqual({ authenticated: true })
  expect(fetch).toHaveBeenCalledTimes(3)
})
it('handles an explicit 401 as unauthenticated without retries', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  expect(await checkSession(url)).toEqual({ authenticated: false })
  expect(fetch).toHaveBeenCalledOnce()
})
it.each([403, 500, 503])(
  'does not turn HTTP %s into a login redirect',
  async (status) => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(null, { status }))
    vi.stubGlobal('fetch', fetch)
    const pending = expect(checkSession(url)).rejects.toBeInstanceOf(
      SessionUnavailableError,
    )
    await vi.runAllTimersAsync()
    await pending
    expect(fetch).toHaveBeenCalledTimes(3)
  },
)
it.each(['not-json', '{}', '{"authenticated":"false"}', 'null'])(
  'does not authenticate or log out using malformed session data: %s',
  async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(body)),
    )
    const pending = expect(checkSession(url)).rejects.toBeInstanceOf(
      SessionUnavailableError,
    )
    await vi.runAllTimersAsync()
    await pending
  },
)
it('bounds stalled requests and clears every timeout', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          ),
        ),
    )
  vi.stubGlobal('fetch', fetch)
  const pending = expect(checkSession(url)).rejects.toBeInstanceOf(
    SessionUnavailableError,
  )
  await vi.runAllTimersAsync()
  await pending
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})
