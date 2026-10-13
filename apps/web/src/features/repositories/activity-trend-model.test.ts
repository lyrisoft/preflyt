import { describe, expect, it } from 'vitest'
import { activityTrend } from './activity-trend-model'

describe('assessment activity trend', () => {
  it('fills missing days and excludes records outside the selected UTC period', () => {
    const result = activityTrend(
      '2026-10-07',
      '2026-10-09',
      [
        { date: '2026-10-06', count: 99 },
        { date: '2026-10-07', count: 2 },
        { date: '2026-10-09', count: 5 },
      ],
      'day'
    )
    expect(result.points.map((point) => point.count)).toEqual([2, 0, 5])
    expect(result).toMatchObject({ total: 7, activeDays: 2, peak: 5 })
  })
  it('aggregates Monday weeks across years without losing partial-week boundaries', () => {
    const result = activityTrend(
      '2025-12-31',
      '2026-01-06',
      [
        { date: '2025-12-31', count: 2 },
        { date: '2026-01-04', count: 3 },
        { date: '2026-01-05', count: 4 },
        { date: '2026-01-06', count: 1 },
      ],
      'week'
    )
    expect(result.points).toEqual([
      { date: '2025-12-31', through: '2026-01-04', count: 5 },
      { date: '2026-01-05', through: '2026-01-06', count: 5 },
    ])
    expect(result.total).toBe(10)
  })
  it('uses a true zero baseline for an empty period and rejects invalid counts', () => {
    const result = activityTrend(
      '2024-02-28',
      '2024-03-01',
      [
        { date: '2024-02-29', count: -1 },
        { date: '2024-03-01', count: NaN },
      ],
      'day'
    )
    expect(result.points).toHaveLength(3)
    expect(result.points.every((point) => point.count === 0)).toBe(true)
    expect(result).toMatchObject({ total: 0, activeDays: 0, peak: 0 })
    expect(activityTrend('invalid', 'invalid', [], 'week').points).toEqual([])
  })
})
