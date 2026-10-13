/** Public, synthetic demo workspace. Never import authenticated workspace data here. */
import type { DashboardData } from '@/features/dashboard/dashboard-types'
import type { HealthPortfolioData } from '@/features/health/health-api'

const demoPrCount = 86

export const demoActivity = Array.from({ length: 180 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 3, 15 + day))
  const weekday = date.getUTCDay()
  return {
    date: date.toISOString().slice(0, 10),
    count:
      weekday === 0 || weekday === 6
        ? [1, 2, 3, 1, 2, 1][day % 6]
        : [8, 12, 5, 17, 9, 14, 6, 11, 16, 7][day % 10],
  }
})

const repositoryDefinitions = [
  ['platform-api', ['TypeScript', 'NestJS']],
  ['web', ['TypeScript', 'React', 'Next.js']],
  ['worker', ['TypeScript', 'JavaScript']],
  ['identity-service', ['Go']],
  ['billing-service', ['TypeScript', 'Express']],
  ['data-pipeline', ['Python']],
  ['notifications', ['TypeScript', 'Fastify']],
  ['infrastructure', ['Go', 'Python']],
  ['mobile', ['TypeScript', 'React']],
  ['shared-libraries', ['TypeScript']],
  ['developer-tools', ['Rust']],
  ['documentation', ['JavaScript', 'React']],
] as const

export const demoRepositories: DashboardData['repositories'] =
  repositoryDefinitions.map(([name, technologies], index) => ({
    githubId: String(101 + index),
    fullName: `northstar/${name}`,
    technologies: [...technologies],
    profileComplete: true,
    profileBranch: 'main',
    policy: index < 10 ? 'Engineering baseline' : null,
    latestAssessment: {
      id: `demo-assessment-${index + 1}`,
      sourceSha: index === 0 ? '7c82a1f' : (8300000 + index * 173).toString(16),
      createdAt: `2026-10-11T${String(15 - (index % 6)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00Z`,
    },
    readiness: 'NOT_EVALUATED',
    sync: { state: 'SYNCED', verifiedAt: '2026-10-11T15:00:00Z' },
  }))

// Distribute each saved assessment exactly once across the twelve repositories.
// All PRs were authored/assessed in the contributor view's last-30-day scope.
const recentAssessmentSlots = demoActivity
  .slice(-30)
  .flatMap((day, index) => Array.from({ length: day.count }, () => index + 150))
const prAssessmentDays = Array.from(
  { length: demoPrCount },
  (_, index) =>
    recentAssessmentSlots[
      Math.floor((index * recentAssessmentSlots.length) / demoPrCount)
    ]
)
const assessedRepositoriesByDay = new Map<number, number[]>()
prAssessmentDays.forEach((day, index) => {
  const repositories = assessedRepositoriesByDay.get(day) ?? []
  repositories.push(index % demoRepositories.length)
  assessedRepositoriesByDay.set(day, repositories)
})
const repositoryWeights = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
export const demoRepositoryActivity = Object.fromEntries(
  demoRepositories.map((repository, repositoryIndex) => [
    repository.githubId,
    demoActivity.map((day, dayIndex) => {
      const assessedRepositories = assessedRepositoriesByDay.get(dayIndex) ?? []
      const remaining = day.count - assessedRepositories.length
      return {
        date: day.date,
        count:
          assessedRepositories.filter((index) => index === repositoryIndex)
            .length +
          Array.from(
            { length: remaining },
            (_, assessment) =>
              repositoryWeights[
                (dayIndex * 3 + assessment) % repositoryWeights.length
              ]
          ).filter((index) => index === repositoryIndex).length,
      }
    }),
  ])
) as Record<string, { date: string; count: number }[]>

export const demoPullRequests = Array.from(
  { length: demoPrCount },
  (_, index) => {
    const repository = demoRepositories[index % demoRepositories.length]
    const date = demoActivity[prAssessmentDays[index]].date
    const headSha = (140000000 + index * 239).toString(16)
    const titles = [
      'Tighten request validation',
      'Upgrade dependency lockfile',
      'Add retry coverage',
      'Improve authorization checks',
      'Refine deployment configuration',
      'Handle expired sessions',
      'Reduce duplicate query work',
      'Add source evidence links',
    ]
    return {
      number: 100 + index,
      repositoryId: repository.githubId,
      repository: repository.fullName,
      title: titles[index % titles.length],
      author:
        index < 48
          ? 'alex-northstar'
          : index < 74
            ? 'sam-northstar'
            : 'jordan-northstar',
      headRef: `feature/${titles[index % titles.length].toLowerCase().replace(/ /g, '-')}`,
      headSha,
      assessmentSourceSha:
        index < 64 ? headSha : (139000000 + index * 239).toString(16),
      draft: index === 84,
      state: index >= 76 ? 'open' : 'merged',
      assessedAt: date,
      updatedAt: `${index >= 76 ? '2026-10-11' : date}T14:30:00Z`,
      reason: !repository.policy
        ? 'STANDARDS_NOT_ADOPTED'
        : index >= 64
          ? 'CONTEXT_UNAVAILABLE'
          : 'EXECUTION_NOT_VERIFIED',
      readiness: 'NOT_EVALUATED',
    }
  }
)

export const demoMetrics = {
  repositories: demoRepositories.length,
  prsAssessed: demoPullRequests.length,
  snapshots: demoActivity.reduce((total, day) => total + day.count, 0),
  standardsAdopted: demoRepositories.filter((repository) => repository.policy)
    .length,
  repositoriesWithSnapshots: demoRepositories.filter(
    (repository) => repository.latestAssessment
  ).length,
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

export const demoHealthPortfolio: HealthPortfolioData = {
  statuses: {
    complete: demoRepositories.length,
    partial: 0,
    failed: 0,
    cancelled: 0,
  },
  priorityFindings: demoFindings
    .filter((finding) => finding.severity === 'high')
    .map((finding, index) => ({
      repositoryId: demoRepositories.find(
        (repository) => repository.fullName === finding.repository
      )!.githubId,
      repositoryName: finding.repository,
      assessmentId: `demo-priority-${index + 1}`,
      branch: 'main',
      fingerprint: `demo-priority-finding-${index + 1}`,
      title: finding.title,
      severity: finding.severity,
      path: finding.path,
      line: null,
    })),
  summary: {
    repositories: demoRepositories.length,
    analyzed: demoRepositories.length,
    assessed: demoRepositories.length,
    active: 0,
    incomplete: 0,
    high: demoFindings.filter((finding) => finding.severity === 'high').length,
    notAssessed: 0,
  },
  bounded: false,
  total: demoRepositories.length,
  page: 1,
  items: demoRepositories.map((repository) => {
    const findings = demoFindings.filter(
      (finding) => finding.repository === repository.fullName
    )
    return {
      repositoryId: repository.githubId,
      name: repository.fullName,
      branch: 'main',
      id: repository.latestAssessment!.id,
      state: 'COMPLETE',
      overallHealth: {
        version: 1,
        status: findings.length ? 'UNHEALTHY' : 'HEALTHY',
        reasons: [],
      },
      completeness: 'COMPLETE',
      mode: 'EXECUTED',
      freshness: 'CURRENT',
      finishedAt: repository.latestAssessment!.createdAt,
      findings: findings.length,
      severity: {
        high: findings.filter((finding) => finding.severity === 'high').length,
        medium: findings.filter((finding) => finding.severity === 'medium')
          .length,
        low: findings.filter((finding) => finding.severity === 'low').length,
      },
    }
  }),
}
