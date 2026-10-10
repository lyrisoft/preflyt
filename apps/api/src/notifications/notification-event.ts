import { configurationValue } from '../configuration/runtime-configuration.js'
import { normalizeReportFindings } from '../findings/normalize-report-findings.js'
import { digest } from "../assessments/assessment-digest.js";
import type { Prisma } from "../generated/prisma/client.js";

export const notificationsEnabled = () =>
  configurationValue('NOTIFICATIONS_ENABLED') === "true";
export function assessmentNotification(report: unknown) {
  const value = report as {
    coverage?: string;
    checks?: { providerResult?: string | null }[];
    observations?: { result?: string }[];
  };
  // These are imported assessment signals, never a claim of merge readiness.
  if (
    value.checks?.some((c) => c.providerResult === "FAILED") ||
    value.observations?.some((o) => o.result === "FAILED")
  )
    return { type: "ASSESSMENT_FAILED", severity: "error" };
  if (value.coverage === "INCOMPLETE")
    return { type: "ASSESSMENT_INCOMPLETE", severity: "warning" };
  return { type: "ASSESSMENT_COMPLETED", severity: "info" };
}
export async function recordAssessmentNotification(
  tx: Prisma.TransactionClient,
  assessment: { id: string; report: unknown; sourceSha: string },
  repo: {
    id: string;
    installationId: bigint;
    githubId: bigint;
    fullName: string;
  },
  actorId: string | null,
) {
  if (!notificationsEnabled()) return;
  const installation = await tx.gitHubInstallation.findUniqueOrThrow({
    where: { id: repo.installationId },
  });
  const observations = (assessment.report as { observations?: { deliveryId: string; artifacts?: { id: string; sha256: string }[] }[] }).observations ?? []
  const references = observations.flatMap(observation => (observation.artifacts ?? []).map(ref => ({ ...ref, deliveryId: observation.deliveryId }))).slice(0, 100)
  const artifacts = references.length ? await tx.ciArtifactImport.findMany({ where: { id: { in: references.map(ref => ref.id) }, evidence: { repositoryGithubId: repo.githubId, installationId: repo.installationId, sourceSha: assessment.sourceSha } }, take: 100 }) : []
  const critical = artifacts.some(artifact => {
    if (!references.some(ref => ref.id === artifact.id && ref.sha256 === artifact.sha256 && ref.deliveryId === artifact.deliveryId)) return false
    return normalizeReportFindings(artifact.format, artifact.content, artifact.sha256).some(finding => finding.severity === 'critical' && !finding.suppressed)
  })
  await tx.notificationEvent.create({
    data: {
      assessmentId: assessment.id,
      organizationId: installation.organizationId,
      repositoryId: repo.id,
      repositoryGithubId: repo.githubId.toString(),
      repositoryName: repo.fullName,
      sourceSha: assessment.sourceSha,
      actorId,
      ...(critical ? { type: 'CRITICAL_FINDINGS_REPORTED', severity: 'error' } : assessmentNotification(assessment.report)),
    },
  });
}

export async function recordPolicyNotification(
  tx: Prisma.TransactionClient,
  policy: { id: string; repositoryId: string; organizationId: string },
  actorId: string,
) {
  if (!notificationsEnabled()) return;
  const repo = await tx.gitHubRepository.findUniqueOrThrow({
    where: { id: policy.repositoryId },
  });
  await tx.notificationEvent.create({
    data: {
      policyId: policy.id,
      organizationId: policy.organizationId,
      repositoryId: repo.id,
      repositoryGithubId: repo.githubId.toString(),
      repositoryName: repo.fullName,
      sourceSha: null,
      actorId,
      type: "POLICY_PUBLISHED",
      severity: "info",
    },
  });
}

export const governanceNotificationTypes = [
  "POLICY_PUBLISHED",
  "RULESET_ACTIVATED",
  "RULESET_ROLLED_BACK",
  "RULESET_DRIFTED",
];
export const assessmentNotificationTypes = [
  "CRITICAL_FINDINGS_REPORTED",
  "ASSESSMENT_COMPLETED",
  "ASSESSMENT_FAILED",
  "ASSESSMENT_INCOMPLETE",
  "READINESS_BLOCKED",
  "READINESS_INCOMPLETE",
];
export const isGovernanceNotification = (type: string) =>
  governanceNotificationTypes.includes(type);
/** Idempotent durable outbox event, inserted in the same transaction as verified state. */
export async function recordReadinessNotification(
  tx: Prisma.TransactionClient,
  repo: { id: string; githubId: bigint; fullName: string },
  organizationId: string,
  actorId: string,
  prNumber: number,
  sourceSha: string,
  policyHash: string | null,
  status: string,
) {
  if (!notificationsEnabled() || !["BLOCK", "INCOMPLETE"].includes(status))
    return;
  const type =
    status === "BLOCK" ? "READINESS_BLOCKED" : "READINESS_INCOMPLETE";
  await tx.notificationEvent.createMany({
    data: [
      {
        id: digest({
          kind: "readiness",
          repositoryId: repo.id,
          prNumber,
          sourceSha,
          policyHash,
          type,
        }),
        organizationId,
        repositoryId: repo.id,
        repositoryGithubId: repo.githubId.toString(),
        repositoryName: repo.fullName,
        sourceSha,
        actorId,
        type,
        severity: status === "BLOCK" ? "error" : "warning",
      },
    ],
    skipDuplicates: true,
  });
}
export async function recordRulesetNotification(
  tx: Prisma.TransactionClient,
  repo: { id: string; githubId: bigint; fullName: string },
  organizationId: string,
  actorId: string,
  deploymentId: string,
  state: "ACTIVE" | "ROLLED_BACK" | "DRIFTED",
  observedHash: string,
) {
  if (!notificationsEnabled()) return;
  const type =
    state === "ACTIVE"
      ? "RULESET_ACTIVATED"
      : state === "ROLLED_BACK"
        ? "RULESET_ROLLED_BACK"
        : "RULESET_DRIFTED";
  await tx.notificationEvent.createMany({
    data: [
      {
        id: digest({ kind: "ruleset", deploymentId, state, observedHash }),
        organizationId,
        repositoryId: repo.id,
        repositoryGithubId: repo.githubId.toString(),
        repositoryName: repo.fullName,
        sourceSha: null,
        actorId,
        type,
        severity: state === "DRIFTED" ? "warning" : "info",
      },
    ],
    skipDuplicates: true,
  });
}
