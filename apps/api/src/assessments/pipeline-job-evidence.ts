import { digest } from './assessment-digest.js'
import { importCiEvidence } from '../github-events/ci-evidence.js'
/** Internal projection of independently verified GitHub jobs, not a webhook event. */
export async function recordJobEvidence(db: any, input: { submissionId: string; repositoryId: bigint;
  installationId: bigint; sourceSha: string; runId: string; runAttempt: number; workflowId: string;
  jobIds: string[]; conclusion: string }) {
  const now = new Date()
  const delivery = { id: `pipeline-jobs:${input.submissionId}`, event: 'workflow_jobs', action: 'completed',
    installationId: input.installationId, repositoryGithubId: input.repositoryId, sourceSha: input.sourceSha,
    sourceObjectId: input.runId, sourceIdentity: { kind: 'workflow_run', workflowId: input.workflowId,
      runAttempt: input.runAttempt, verificationScope: 'jobs', jobIds: input.jobIds },
    sourceStatus: 'completed', sourceConclusion: input.conclusion, sourceUpdatedAt: now,
    payloadHash: digest({ ...input, repositoryId: input.repositoryId.toString(), installationId: input.installationId.toString() }),
    state: 'PROCESSED', reason: 'GITHUB_API_VERIFIED_JOBS', receivedAt: now, processedAt: now }
  await db.gitHubWebhookDelivery.createMany({ data: [delivery], skipDuplicates: true })
  const saved = await db.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
  const evidence = importCiEvidence(saved)!
  await db.importedCiEvidence.createMany({ data: [evidence], skipDuplicates: true })
  return db.importedCiEvidence.findUniqueOrThrow({ where: { deliveryId: delivery.id } })
}
