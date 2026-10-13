import { configurationValue } from "../configuration/runtime-configuration.js";
import { normalizeReportFindings } from "../findings/normalize-report-findings.js";
import { digest } from "../assessments/assessment-digest.js";
import type {
  NativeExecutionRequest,
  Prisma,
} from "../generated/prisma/client.js";

export const notificationsEnabled = () =>
  configurationValue("NOTIFICATIONS_ENABLED") === "true";
export function assessmentNotification(report: unknown) {
  const value = report as {
    coverage?: string;
    checks?: {
      providerResult?: string | null;
      evidenceSource?: string;
      nativeOutcome?: string;
    }[];
    observations?: { result?: string }[];
  };
  // Saved check outcomes describe the assessment, never GitHub merge permission.
  if (
    value.checks?.some(
      (c) =>
        c.providerResult === "FAILED" ||
        (c.evidenceSource === "NATIVE" && c.nativeOutcome === "FAIL"),
    ) ||
    value.observations?.some((o) => o.result === "FAILED")
  )
    return { type: "ASSESSMENT_FAILED", severity: "error" };
  if (value.coverage === "INCOMPLETE")
    return { type: "ASSESSMENT_INCOMPLETE", severity: "warning" };
  return { type: "ASSESSMENT_COMPLETED", severity: "info" };
}
export async function recordAssessmentNotification(
  tx: Prisma.TransactionClient,
  assessment: {
    id: string;
    report: unknown;
    sourceSha: string;
    request?: unknown;
    requestKey?: string;
  },
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
  const observations =
    (
      assessment.report as {
        observations?: {
          deliveryId: string;
          artifacts?: { id: string; sha256: string }[];
        }[];
      }
    ).observations ?? [];
  const references = observations
    .flatMap((observation) =>
      (observation.artifacts ?? []).map((ref) => ({
        ...ref,
        deliveryId: observation.deliveryId,
      })),
    )
    .slice(0, 100);
  const artifacts = references.length
    ? await tx.ciArtifactImport.findMany({
        where: {
          id: { in: references.map((ref) => ref.id) },
          evidence: {
            repositoryGithubId: repo.githubId,
            installationId: repo.installationId,
            sourceSha: assessment.sourceSha,
          },
        },
        take: 100,
      })
    : [];
  const critical = artifacts.some((artifact) => {
    if (
      !references.some(
        (ref) =>
          ref.id === artifact.id &&
          ref.sha256 === artifact.sha256 &&
          ref.deliveryId === artifact.deliveryId,
      )
    )
      return false;
    return normalizeReportFindings(
      artifact.format,
      artifact.content,
      artifact.sha256,
    ).some((finding) => finding.severity === "critical" && !finding.suppressed);
  });
  // Native completion already records its failure in the state transaction. Reusing
  // that attempt's event avoids a second generic notice when its assessment is saved.
  const nativeAttempts =
    (
      assessment.report as {
        nativeExecutions?: { id: string; controllerJobId: string | null }[];
      }
    ).nativeExecutions ?? [];
  const nativeRequestId =
    (assessment.request as { trigger?: string } | undefined)?.trigger ===
      "NATIVE" && assessment.requestKey?.startsWith("native:")
      ? assessment.requestKey.slice("native:".length)
      : null;
  const nativeEventIds = nativeAttempts
    .filter(
      (attempt) => attempt.controllerJobId && attempt.id === nativeRequestId,
    )
    .map((attempt) =>
      nativeExecutionFailureId(attempt.id, attempt.controllerJobId!),
    );
  if (
    !critical &&
    nativeEventIds.length &&
    (await tx.notificationEvent.findFirst({
      where: {
        id: { in: nativeEventIds },
        type: "NATIVE_EXECUTION_FAILED",
        organizationId: installation.organizationId,
        repositoryId: repo.id,
        sourceSha: assessment.sourceSha,
      },
    }))
  )
    return;
  await tx.notificationEvent.create({
    data: {
      assessmentId: assessment.id,
      organizationId: installation.organizationId,
      repositoryId: repo.id,
      repositoryGithubId: repo.githubId.toString(),
      repositoryName: repo.fullName,
      sourceSha: assessment.sourceSha,
      actorId,
      ...(critical
        ? { type: "CRITICAL_FINDINGS_REPORTED", severity: "error" }
        : assessmentNotification(assessment.report)),
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
  "POLICY_EXCEPTION_REQUESTED", "POLICY_EXCEPTION_APPROVED", "POLICY_EXCEPTION_REJECTED", "POLICY_EXCEPTION_REVOKED", "POLICY_EXCEPTION_EXPIRED",
  "RULESET_ACTIVATED",
  "RULESET_ROLLED_BACK",
  "RULESET_DRIFTED",
];
export const assessmentNotificationTypes = [
  "HEALTH_ASSESSMENT_COMPLETED", "HEALTH_ASSESSMENT_PARTIAL", "HEALTH_ASSESSMENT_FAILED",
  "NATIVE_EXECUTION_FAILED",
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

export function nativeExecutionFailureId(requestId: string, attemptId: string) {
  return digest({ kind: "native-execution-failure", requestId, attemptId });
}

/** Internal execution services call this only for an admitted failed attempt, never an admission denial or user cancellation. */
export async function recordNativeExecutionFailure(
  tx: Prisma.TransactionClient,
  request: Pick<
    NativeExecutionRequest,
    | "id"
    | "controllerJobId"
    | "organizationId"
    | "repositoryId"
    | "repositoryGithubId"
    | "sourceSha"
    | "actorId"
  >,
) {
  if (!notificationsEnabled() || !request.controllerJobId || (request as NativeExecutionRequest).healthAssessmentId) return;
  const repo = await tx.gitHubRepository.findFirst({
    where: {
      id: request.repositoryId,
      githubId: BigInt(request.repositoryGithubId),
      selected: true,
      available: true,
      installation: { active: true, organizationId: request.organizationId },
    },
  });
  if (!repo) return;
  await tx.notificationEvent.createMany({
    data: [
      {
        id: nativeExecutionFailureId(request.id, request.controllerJobId),
        organizationId: request.organizationId,
        repositoryId: repo.id,
        repositoryGithubId: repo.githubId.toString(),
        repositoryName: repo.fullName,
        sourceSha: request.sourceSha,
        actorId: request.actorId,
        type: "NATIVE_EXECUTION_FAILED",
        severity: "error",
      },
    ],
    skipDuplicates: true,
  });
}
