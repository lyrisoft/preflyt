import { expect, it } from 'vitest'
import { legacyDashboardSearch } from './search'

it('preserves plain and router-serialized legacy dashboard filters', () => {
  const expected = { tab: 'health', days: '30', repository: '1410129036' }
  expect(
    legacyDashboardSearch('?tab=health&days=30&repository=1410129036')
  ).toEqual(expected)
  expect(
    legacyDashboardSearch(
      '?tab=health&days=%2230%22&repository=%221410129036%22'
    )
  ).toEqual(expected)
})
it('keeps campaign links public and rejects invalid filter values', () => {
  expect(legacyDashboardSearch('?utm_source=github')).toBeNull()
  expect(legacyDashboardSearch('?tab=bad&days=999&repository=-1')).toEqual({
    tab: 'overview',
    days: undefined,
    repository: undefined,
  })
})
