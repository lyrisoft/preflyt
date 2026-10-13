import { digest } from '../assessments/assessment-digest.js'
import type { NativeExecutionRequest } from '../generated/prisma/client.js'
export function nativeRequestIntegrity(record: NativeExecutionRequest) {
  const plan = record.plan as Record<string, unknown>
  return (
    !!plan &&
    digest(plan) === record.planHash &&
    plan.repositoryId === record.repositoryGithubId &&
    plan.organizationId === record.organizationId &&
    plan.sourceSha === record.sourceSha &&
    plan.selectionId === record.selectionId &&
    digest({
      organizationId: record.organizationId,
      repositoryId: record.repositoryGithubId,
      actorId: record.actorId,
      input: {
        requestKey: record.requestKey,
        expectedSourceSha: record.sourceSha,
        expectedSelectionId: record.selectionId,
        expectedPlanHash: record.planHash,
        ruleIds: record.ruleIds,
      },
    }) === record.inputHash
  )
}
