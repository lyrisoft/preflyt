import { describe, expect, it } from 'vitest'
import { summarizeCiActivity } from './ci-activity-model'
import type { CiObservation } from './repository-queries'

type Observation = Pick<
  CiObservation,
  'result' | 'observedAt' | 'sourceSha' | 'artifacts'
>
const observation = (overrides: Partial<Observation> = {}): Observation => ({
  result: 'SUCCEEDED',
  observedAt: '2026-10-09T12:00:00Z',
  sourceSha: 'a'.repeat(40),
  artifacts: [],
  ...overrides,
})

describe('CI activity aggregation', () => {
  it('counts received provider states without treating them as verified gate outcomes', () => {
    const summary = summarizeCiActivity([
      observation(),
      observation({ result: 'FAILED', sourceSha: 'b'.repeat(40) }),
      observation({ result: 'PENDING' }),
      observation({ result: 'NOT_EXECUTED' }),
      observation({
        result: 'UNKNOWN',
        artifacts: [
          {
            id: 'junit',
            format: 'junit',
            sha256: 'a',
            parserVersion: 1,
            verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
            summary: {},
            createdAt: '2026-10-09T12:00:00Z',
          },
          {
            id: 'sarif',
            format: 'sarif',
            sha256: 'b',
            parserVersion: 1,
            verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
            summary: {},
            createdAt: '2026-10-09T12:00:00Z',
          },
        ],
      }),
    ])
    expect(summary.results).toEqual({
      SUCCEEDED: 1,
      FAILED: 1,
      PENDING: 1,
      NOT_EXECUTED: 1,
      UNKNOWN: 1,
    })
    expect(summary.commits).toBe(2)
    expect(summary.reports).toBe(2)
  })

  it('groups by UTC day and includes gaps between received deliveries', () => {
    const summary = summarizeCiActivity([
      observation({ observedAt: '2026-10-07T23:30:00-02:00' }),
      observation({
        observedAt: '2026-10-10T00:30:00+01:00',
        result: 'FAILED',
      }),
      observation({ observedAt: '2026-10-11T12:00:00Z', result: 'PENDING' }),
    ])
    expect(summary.days.map((day) => day.day)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ])
    expect(summary.days[0].SUCCEEDED).toBe(1)
    expect(summary.days[1].FAILED).toBe(1)
    expect(summary.days[2]).toEqual({
      day: '2026-10-10',
      SUCCEEDED: 0,
      FAILED: 0,
      PENDING: 0,
      NOT_EXECUTED: 0,
      UNKNOWN: 0,
    })
    expect(summary.days[3].PENDING).toBe(1)
  })

  it('bounds the daily trend while keeping full returned-sample totals', () => {
    const summary = summarizeCiActivity([
      observation({ observedAt: '2026-09-01T12:00:00Z', result: 'FAILED' }),
      observation({ observedAt: '2026-10-09T12:00:00Z' }),
    ])
    expect(summary.days).toHaveLength(14)
    expect(summary.days[0].day).toBe('2026-09-26')
    expect(summary.days[summary.days.length - 1]?.day).toBe('2026-10-09')
    expect(summary.days.reduce((sum, day) => sum + day.FAILED, 0)).toBe(0)
    expect(summary.results.FAILED).toBe(1)
  })

  it('produces no fabricated activity for an empty sample', () => {
    expect(summarizeCiActivity([])).toEqual({
      results: {
        SUCCEEDED: 0,
        FAILED: 0,
        PENDING: 0,
        NOT_EXECUTED: 0,
        UNKNOWN: 0,
      },
      reports: 0,
      commits: 0,
      days: [],
    })
  })

  it('ignores invalid delivery timestamps in the trend without dropping result totals', () => {
    const summary = summarizeCiActivity([
      observation({ observedAt: 'invalid', result: 'UNKNOWN' }),
    ])
    expect(summary.days).toEqual([])
    expect(summary.results.UNKNOWN).toBe(1)
    expect(summary.commits).toBe(1)
  })
})
