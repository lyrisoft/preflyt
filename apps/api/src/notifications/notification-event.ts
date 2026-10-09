import type { Prisma } from '../generated/prisma/client.js'

export const notificationsEnabled = () => process.env.NOTIFICATIONS_ENABLED === 'true'
export function assessmentNotification(report: unknown) {
  const value = report as { coverage?: string; checks?: { providerResult?: string | null }[]; observations?: { result?: string }[] }
  // These are imported assessment signals, never a claim of merge readiness.
  if (value.checks?.some((c) => c.providerResult === 'FAILED') || value.observations?.some((o) => o.result === 'FAILED'))
    return { type: 'ASSESSMENT_FAILED', severity: 'error' }
  if (value.coverage === 'INCOMPLETE')
    return { type: 'ASSESSMENT_INCOMPLETE', severity: 'warning' }
  return { type: 'ASSESSMENT_COMPLETED', severity: 'info' }
}
export async function recordAssessmentNotification(
  tx: Prisma.TransactionClient,
  assessment: { id: string; report: unknown; sourceSha: string },
  repo: { id: string; installationId: bigint; githubId: bigint; fullName: string },
  actorId: string | null,
) {
  if (!notificationsEnabled()) return
  const installation = await tx.gitHubInstallation.findUniqueOrThrow({ where: { id: repo.installationId } })
  await tx.notificationEvent.create({ data: {
    assessmentId: assessment.id, organizationId: installation.organizationId,
    repositoryId: repo.id, repositoryGithubId: repo.githubId.toString(), repositoryName: repo.fullName,
    sourceSha: assessment.sourceSha, actorId, ...assessmentNotification(assessment.report),
  } })
}

export async function recordPolicyNotification(
  tx: Prisma.TransactionClient,
  policy: { id: string; repositoryId: string; organizationId: string },
  actorId: string,
) {
  if (!notificationsEnabled()) return
  const repo = await tx.gitHubRepository.findUniqueOrThrow({ where: { id: policy.repositoryId } })
  await tx.notificationEvent.create({ data: {
    policyId: policy.id, organizationId: policy.organizationId, repositoryId: repo.id,
    repositoryGithubId: repo.githubId.toString(), repositoryName: repo.fullName,
    sourceSha: null, actorId, type: 'POLICY_PUBLISHED', severity: 'info',
  } })
}
