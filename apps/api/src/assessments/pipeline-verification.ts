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
  verificationScope?: string
  jobIds?: string[]
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
    !['workflow_run', 'workflow_jobs'].includes(observation.sourceKind) ||
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
        m.workflowId === observation.sourceIdentity?.workflowId &&
        (observation.sourceKind !== 'workflow_jobs' || (m.verificationScope === 'jobs' &&
          JSON.stringify(m.jobIds) === JSON.stringify(observation.sourceIdentity?.jobIds))),
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
          verificationScope: m.verificationScope,
          jobIds: m.jobIds,
          verifiedAt: m.verifiedAt,
        })),
    )
}

/** Prefer attached report bytes only when the server verified this exact run. */
export function verifiedPipelineReports(
  receipts: any[],
  observations: Array<{ deliveryId: string; artifacts: Array<{ sha256: string }> }>,
) {
  const verified = new Map<string, Set<string>>()
  for (const observation of observations)
    for (const artifact of observation.artifacts)
      for (const execution of githubReportExecutions(receipts, observation, artifact.sha256)) {
        const deliveries = verified.get(execution.ruleId) ?? new Set<string>()
        deliveries.add(observation.deliveryId)
        verified.set(execution.ruleId, deliveries)
      }
  return verified
}
