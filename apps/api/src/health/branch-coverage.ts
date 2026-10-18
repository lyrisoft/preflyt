import {
  verifiedHealthCiCoverage,
  type HealthCiCoverage,
} from './health-ci-coverage.js'

/** Saved branch reports are independent of Health; exact-revision projection remains unchanged. */
export async function branchCoverage(
  db: any,
  repo: {
    id: string
    githubId: bigint
    installationId: bigint
    fullName: string
  },
  organizationId: string,
  branch: string | null,
  healthSha: string | null,
  exact: HealthCiCoverage,
) {
  const rows = branch
    ? await db.repositoryBranchRun.findMany({
        where: { repositoryId: repo.id, organizationId, branch },
        orderBy: [
          { runCreatedAt: 'desc' },
          { runAttempt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
      })
    : []
  const latest = rows[0]
  const previous = branch
    ? await db.repositoryBranchRun.findFirst({
        where: {
          repositoryId: repo.id,
          organizationId,
          branch,
          state: 'VERIFIED',
          failureCode: null,
        },
        orderBy: [
          { runCreatedAt: 'desc' },
          { runAttempt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      })
    : null
  let result = exact
  if (previous)
    result = await verifiedHealthCiCoverage(db, repo, previous.sourceSha, {
      runId: previous.runId,
      runAttempt: previous.runAttempt,
      branch,
    })
  return {
    branch,
    result,
    matchesHealth: !!result.sourceSha && result.sourceSha === healthSha,
    latestAttempt: latest
      ? {
          state: latest.state,
          sourceSha: latest.sourceSha,
          failureCode: latest.failureCode,
          retryAt: latest.nextAttemptAt,
          createdAt: latest.createdAt,
          finishedAt: latest.finishedAt,
          runUrl: `https://github.com/${repo.fullName}/actions/runs/${latest.runId}/attempts/${latest.runAttempt}`,
        }
      : null,
  }
}
