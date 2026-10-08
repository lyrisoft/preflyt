import { createHash } from 'node:crypto'
import type { GitHubWebhookDelivery } from '../generated/prisma/client.js'

export function ciResult(
  action: string,
  status: string | null,
  conclusion: string | null,
) {
  // A rerequest can carry the preceding run's completed/success state.
  if (action === 'rerequested') return 'PENDING' as const
  if (
    ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(
      status ?? '',
    )
  )
    return 'PENDING' as const
  if (action !== 'completed' || status !== 'completed')
    return 'UNKNOWN' as const
  if (conclusion === 'success') return 'SUCCEEDED' as const
  if (['failure', 'timed_out', 'startup_failure'].includes(conclusion ?? ''))
    return 'FAILED' as const
  if (conclusion === 'skipped') return 'NOT_EXECUTED' as const
  return 'UNKNOWN' as const
}

export function importCiEvidence(delivery: GitHubWebhookDelivery) {
  if (!['check_run', 'workflow_run'].includes(delivery.event)) return null
  const evidence = {
    version: delivery.sourceIdentity ? 2 : 1,
    ...(delivery.sourceIdentity
      ? { sourceIdentity: delivery.sourceIdentity as object }
      : {}),
    deliveryId: delivery.id,
    repositoryGithubId: delivery.repositoryGithubId.toString(),
    installationId: delivery.installationId.toString(),
    sourceSha: delivery.sourceSha,
    sourceKind: delivery.event,
    sourceObjectId: delivery.sourceObjectId,
    sourceAction: delivery.action,
    sourceStatus: delivery.sourceStatus,
    sourceConclusion: delivery.sourceConclusion,
    sourceUpdatedAt: delivery.sourceUpdatedAt?.toISOString() ?? null,
    result: ciResult(
      delivery.action,
      delivery.sourceStatus,
      delivery.sourceConclusion,
    ),
    sourcePayloadHash: delivery.payloadHash,
    observedAt: delivery.receivedAt.toISOString(),
  }
  const evidenceHash = createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex')
  return {
    ...evidence,
    repositoryGithubId: delivery.repositoryGithubId,
    installationId: delivery.installationId,
    sourceUpdatedAt: delivery.sourceUpdatedAt,
    observedAt: delivery.receivedAt,
    evidenceHash,
  }
}
