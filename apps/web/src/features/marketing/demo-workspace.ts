/** Public, synthetic demo workspace. Never import authenticated workspace data here. */
export const demoActivity = Array.from({ length: 90 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 6, 14 + day))
  const weekday = date.getUTCDay()
  return {
    date: date.toISOString().slice(0, 10),
    count:
      weekday === 0 || weekday === 6
        ? day % 3
        : [2, 5, 3, 8, 4, 6, 11, 7, 9, 5][day % 10],
  }
})
export const demoMetrics = {
  repositories: 12,
  prsAssessed: 86,
  snapshots: demoActivity.reduce((total, day) => total + day.count, 0),
  standardsAdopted: 10,
  repositoriesWithSnapshots: 12,
}
export const demoChecks = [
  { name: 'Unit tests', status: 'Passed', tone: 'success' },
  { name: 'Dependency scan', status: 'Passed', tone: 'success' },
  { name: 'Code quality', status: 'Failed', tone: 'error' },
  { name: 'Integration tests', status: 'Not evaluated', tone: 'warning' },
] as const

export const demoFindings = [
  {
    title: 'Dependency includes a vulnerable transitive package',
    repository: 'northstar/platform-api',
    path: 'package-lock.json',
    severity: 'high',
  },
  {
    title: 'Credential detected in a configuration file',
    repository: 'northstar/worker',
    path: 'config/development.yml',
    severity: 'high',
  },
  {
    title: 'Dependency update requires review',
    repository: 'northstar/platform-api',
    path: 'package-lock.json',
    severity: 'medium',
  },
  {
    title: 'Outdated package in the web client',
    repository: 'northstar/web',
    path: 'package-lock.json',
    severity: 'medium',
  },
  {
    title: 'Unhandled promise in request processing',
    repository: 'northstar/platform-api',
    path: 'src/requests/handler.ts:42',
    severity: 'medium',
  },
  {
    title: 'Unused exception parameter',
    repository: 'northstar/worker',
    path: 'src/jobs/retry.ts:18',
    severity: 'low',
  },
]
export const demoContributionSeries = demoActivity
  .slice(-30)
  .map((day, index) => ({
    date: day.date,
    authoredPrs: index % 4,
    mergedPrs: index % 3,
    reviews: (index * 3) % 7,
    commits: day.count,
  }))
export const demoContributionMetrics = demoContributionSeries.reduce(
  (sum, day) => ({
    authoredPrs: sum.authoredPrs + day.authoredPrs,
    mergedPrs: sum.mergedPrs + day.mergedPrs,
    reviews: sum.reviews + day.reviews,
    commits: sum.commits + day.commits,
  }),
  { authoredPrs: 0, mergedPrs: 0, reviews: 0, commits: 0 }
)
