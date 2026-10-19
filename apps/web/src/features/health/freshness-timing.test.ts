import { expect, it } from 'vitest'
import { freshnessTiming } from './freshness-timing'

it('backs off expired, unavailable and invalid timestamps instead of polling each second', () => {
  const now = Date.now()
  for (const timestamp of [
    null,
    undefined,
    'invalid',
    new Date(now - 60001).toISOString(),
    new Date(now - 60000).toISOString(),
  ])
    expect(freshnessTiming(timestamp, now)).toEqual({
      staleTime: 0,
      refetchInterval: 60000,
    })
})
it('keeps verification expiry accurate while bounding near-expiry retries', () => {
  const now = Date.now()
  expect(freshnessTiming(new Date(now).toISOString(), now)).toEqual({
    staleTime: 60000,
    refetchInterval: 60000,
  })
  expect(freshnessTiming(new Date(now - 30000).toISOString(), now)).toEqual({
    staleTime: 30000,
    refetchInterval: 30000,
  })
  expect(freshnessTiming(new Date(now - 59900).toISOString(), now)).toEqual({
    staleTime: 100,
    refetchInterval: 5000,
  })
  expect(
    freshnessTiming(new Date(now + 120000).toISOString(), now).staleTime
  ).toBe(60000)
})
