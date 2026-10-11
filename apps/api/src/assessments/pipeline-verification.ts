import { runAttempt } from './ci-binding.js'

/** Server-created receipt: never accepted from an Action request or manual report upload. */
export type GitHubExecution = {
  submissionId: string
  ruleId: string
  sourceSha: string
  runId: string
  runAttempt: number
  workflowId: string
  policyId: string
  policyHash: string
  verifiedAt: string
}
export async function pipelineVerifications(
  db: any,
  repositoryId: string,
  sourceSha: string,
  selectionId: string,
) {
  const rows = await db.auditEvent.findMany({
    where: {
      event: 'pipeline.run.verified',
      AND: [
        { metadata: { path: ['repositoryId'], equals: repositoryId } },
        { metadata: { path: ['sourceSha'], equals: sourceSha } },
        { metadata: { path: ['selectionId'], equals: selectionId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 101,
    select: { metadata: true },
  })
  // A bounded collection never silently substitutes older receipts.
  if (rows.length > 100) return []
  return rows
    .map((row: any) => row.metadata)
    .filter(
      (m: any) =>
        m.schemaVersion === 1 &&
        m.repositoryId === repositoryId &&
        m.sourceSha === sourceSha &&
        m.selectionId === selectionId &&
        Array.isArray(m.reports) &&
        Array.isArray(m.jobIds) &&
        m.jobIds.length > 0,
    )
}
export function githubReportExecutions(
  receipts: any[],
  observation: any,
  sha256: string,
): GitHubExecution[] {
  if (
    observation.sourceKind !== 'workflow_run' ||
    observation.sourceConclusion !== 'success' ||
    observation.sourceStatus !== 'completed'
  )
    return []
  return receipts
    .filter(
      (m) =>
        m.sourceSha === observation.sourceSha &&
        m.runId === observation.sourceObjectId &&
        m.runAttempt === runAttempt(observation.sourceIdentity) &&
        m.workflowId === observation.sourceIdentity?.workflowId,
    )
    .flatMap((m) =>
      m.reports
        .filter((r: any) => r.sha256 === sha256)
        .map((r: any) => ({
          submissionId: m.submissionId,
          ruleId: r.ruleId,
          sourceSha: m.sourceSha,
          runId: m.runId,
          runAttempt: m.runAttempt,
          workflowId: m.workflowId,
          policyId: m.policyId,
          policyHash: m.policyHash,
          verifiedAt: m.verifiedAt,
        })),
    )
}
