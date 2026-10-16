import { expect, it } from 'vitest'
import type { HealthPortfolioData } from '@/features/health/health-api'
import {
  healthDistribution,
  repositoryHealthGroup,
} from './health-distribution'

const row = (status?: string, state = 'COMPLETED') =>
  ({
    state,
    ...(status ? { overallHealth: { status } } : {}),
  }) as HealthPortfolioData['items'][number]
it('uses health outcomes, not completed-report status, and partitions every repository once', () => {
  const items = [
    'HEALTHY',
    'UNHEALTHY',
    'NEEDS_ATTENTION',
    'INCOMPLETE',
    'NOT_ASSESSED',
    'QUEUED',
    'RUNNING',
  ].map((s) => row(s))
  const distribution = healthDistribution({ items } as HealthPortfolioData)
  expect(distribution.map((s) => s.value)).toEqual([1, 1, 1, 1, 1, 2])
  expect(distribution.reduce((sum, s) => sum + s.value, 0)).toBe(items.length)
  expect(repositoryHealthGroup(row('UNHEALTHY'))).toBe('UNHEALTHY')
})
it('never infers healthy from a completed, failed, cancelled or unknown report', () => {
  for (const state of ['COMPLETED', 'FAILED', 'CANCELLED', 'unexpected'])
    expect(repositoryHealthGroup(row(undefined, state))).toBe('INCOMPLETE')
  expect(repositoryHealthGroup(row(undefined, 'NOT_ASSESSED'))).toBe(
    'NOT_ASSESSED'
  )
  expect(repositoryHealthGroup(row(undefined, 'QUEUED'))).toBe('ACTIVE')
})
