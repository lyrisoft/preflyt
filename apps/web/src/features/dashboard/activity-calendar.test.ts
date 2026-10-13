import { expect, it } from 'vitest'
import { activityLevel, activityWeeks } from './activity-calendar'

it('pads UTC weeks and preserves leap-day activity without inventing data', () => {
  const weeks = activityWeeks('2024-02-28', '2024-03-02', [
    { date: '2024-02-29', count: 3 },
  ])
  expect(weeks).toHaveLength(1)
  expect(weeks[0].slice(0, 3)).toEqual([null, null, null])
  expect(weeks.flat().filter(Boolean)).toEqual([
    { date: '2024-02-28', count: 0 },
    { date: '2024-02-29', count: 3 },
    { date: '2024-03-01', count: 0 },
    { date: '2024-03-02', count: 0 },
  ])
})
it('handles cross-year ranges and guards invalid or oversized ranges', () => {
  expect(
    activityWeeks('2025-12-31', '2026-01-02', []).flat().filter(Boolean)
  ).toHaveLength(3)
  for (const [from, to] of [
    ['bad', 'bad'],
    ['2026-10-10', '2026-10-09'],
    ['2024-01-01', '2026-01-01'],
  ])
    expect(activityWeeks(from, to, [])).toEqual([])
})
it('keeps counts and intensity bounded and uses zero for invalid inputs', () => {
  expect([0, 1, 2, 3, 5, 6, 10, 11].map(activityLevel)).toEqual([
    0, 1, 1, 2, 2, 3, 3, 4,
  ])
  expect(
    activityWeeks('2026-10-09', '2026-10-09', [
      { date: '2026-10-09', count: -5 },
    ])
      .flat()
      .find(Boolean)?.count
  ).toBe(0)
})

it('renders the complete 180-day calendar with zero-filled days and bounded padding', () => {
  const weeks = activityWeeks('2026-04-13', '2026-10-09', [
    { date: '2026-04-12', count: 99 },
    { date: '2026-04-13', count: 3 },
    { date: '2026-10-09', count: 2 },
    { date: '2026-10-10', count: 99 },
  ])
  const days = weeks.flat().filter((day) => day !== null)
  expect(days).toHaveLength(180)
  expect(weeks).toHaveLength(26)
  expect(weeks.every((week) => week.length === 7)).toBe(true)
  expect(days[0]).toEqual({ date: '2026-04-13', count: 3 })
  expect(days[days.length - 1]).toEqual({ date: '2026-10-09', count: 2 })
  expect(days.filter((day) => day.count === 0)).toHaveLength(178)
  expect(days.reduce((total, day) => total + day.count, 0)).toBe(5)
  expect(weeks[0][0]).toBeNull()
  expect(weeks[weeks.length - 1][6]).toBeNull()
})
