import { expect, it } from 'vitest'
import {
  demoActivity,
  demoMetrics,
  demoPullRequests,
  demoRepositories,
  demoRepositoryActivity,
} from './demo-workspace'

it('keeps overview totals and repository allocations consistent with the calendar', () => {
  expect(demoActivity).toHaveLength(180)
  expect(demoActivity.reduce((sum, day) => sum + day.count, 0)).toBe(
    demoMetrics.snapshots
  )
  for (const day of demoActivity) {
    const allocated = demoRepositories.reduce(
      (sum, repository) =>
        sum +
        demoRepositoryActivity[repository.githubId].find(
          (entry) => entry.date === day.date
        )!.count,
      0
    )
    expect(allocated).toBe(day.count)
  }
})

it('keeps contributor PRs and revision evidence within the displayed period', () => {
  const recentDates = new Set(demoActivity.slice(-30).map((day) => day.date))
  expect(demoPullRequests).toHaveLength(demoMetrics.prsAssessed)
  expect(demoPullRequests.every((pr) => recentDates.has(pr.assessedAt))).toBe(
    true
  )
  expect(
    demoPullRequests.filter((pr) => pr.assessmentSourceSha === pr.headSha)
  ).toHaveLength(64)
  for (const repository of demoRepositories) {
    for (const day of demoRepositoryActivity[repository.githubId]) {
      const prs = demoPullRequests.filter(
        (pr) =>
          pr.repositoryId === repository.githubId && pr.assessedAt === day.date
      )
      expect(day.count).toBeGreaterThanOrEqual(prs.length)
    }
  }
  expect(demoPullRequests.every((pr) => pr.readiness === 'NOT_EVALUATED')).toBe(
    true
  )
})
