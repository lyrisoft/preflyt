import { expect, it } from 'vitest'
import { localExpiry, localExpiryDescription } from './local-expiry'

it('rejects incomplete, past, invalid and normalized local dates', () => {
  const now = new Date('2026-01-01').getTime()
  for (const value of [
    '',
    '2027-02',
    '2027-02-30T12:00',
    '2027-13-01T12:00',
    '2025-01-01T12:00',
  ])
    expect(localExpiry(value, now).error).toBeTruthy()
  expect(localExpiry('2028-02-29T12:00', now).date).not.toBeNull()
})
it('previews the selected local date with its actual offset and time zone', () => {
  const date = localExpiry('2099-01-01T12:30').date!
  expect(date.getHours()).toBe(12)
  const preview = localExpiryDescription(date)
  expect(preview).toContain('2099')
  expect(preview).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(preview).toMatch(/GMT|UTC/)
})
it('does not silently move a time through a spring-forward gap', () => {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York')
    return
  expect(
    localExpiry('2027-03-14T02:30', new Date('2026-01-01').getTime()).error
  ).toBe('Choose a valid local date and time.')
  expect(
    localExpiry('2027-11-07T01:30', new Date('2026-01-01').getTime()).date
  ).not.toBeNull()
})
