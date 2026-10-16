import { expect, it } from 'vitest'
import { readPageSize } from '../src/pagination.js'

it('defaults to ten and accepts the supported bounded sizes', () => {
  expect(readPageSize()).toBe(10)
  for (const size of [10, 25, 50, 100]) expect(readPageSize(String(size))).toBe(size)
})

it('rejects invalid and unbounded page sizes', () => {
  for (const size of [0, -1, 11, 1000, 10.5, 'all', '', null, NaN]) expect(() => readPageSize(size)).toThrow()
})
