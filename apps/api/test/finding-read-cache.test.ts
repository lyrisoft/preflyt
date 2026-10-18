import { afterEach, expect, it, vi } from 'vitest'
import { FindingReadCache } from '../src/findings/finding-read-cache.js'
afterEach(() => vi.useRealTimers())
it('returns independent rows, expires entries and evicts least recently used projections', () => {
  vi.useFakeTimers()
  const cache = new FindingReadCache()
  cache.set('first', { rows: [{ title: 'Original' }] })
  cache.get<any>('first').rows[0].title = 'Changed by triage'
  expect(cache.get<any>('first').rows[0].title).toBe('Original')
  for (let i = 0; i < 15; i++) cache.set(String(i), { value: i })
  cache.get('first')
  cache.set('new', { value: 16 })
  expect(cache.get('0')).toBeUndefined()
  expect(cache.get('first')).toBeDefined()
  vi.advanceTimersByTime(300001)
  expect(cache.get('first')).toBeUndefined()
})
it('bounds both individual and aggregate memory without changing uncached results', () => {
  const cache = new FindingReadCache(),
    large = 'x'.repeat(1024 * 1024)
  cache.set('oversized', large.repeat(9))
  expect(cache.get('oversized')).toBeUndefined()
  for (let i = 0; i < 16; i++) cache.set(String(i), { text: large.repeat(3) })
  expect(cache.get('0')).toBeUndefined()
  expect(cache.get('15')).toEqual({ text: large.repeat(3) })
})
