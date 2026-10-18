import { Prisma } from "../generated/prisma/client.js";
import type { RetentionField } from "./retention-policy.js";

// Fixed SQL identifiers only. Tenant and cutoffs are always bound parameters.
export function candidates(
  kind: RetentionField,
  organizationId: string,
  cutoff: Date,
) {
  const scope = Prisma.sql`SELECT r.id FROM "GitHubRepository" r JOIN "GitHubInstallation" i ON i.id=r."installationId" WHERE i."organizationId"=${organizationId}`;
  switch (kind) {
    case "assessmentDays":
      return {
        table: "CommitAssessment",
        sql: Prisma.sql`
  SELECT a.id FROM "CommitAssessment" a WHERE a."repositoryId" IN (${scope}) AND a."createdAt"<${cutoff}
  AND EXISTS (SELECT 1 FROM "CommitAssessment" newer WHERE newer."repositoryId"=a."repositoryId" AND (newer.request->'baseContext'->>'ref') IS NOT DISTINCT FROM (a.request->'baseContext'->>'ref') AND (newer."createdAt",newer.id)>(a."createdAt",a.id))
  AND NOT EXISTS (SELECT 1 FROM "GitHubCheckPublication" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "ReadinessTask" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "PipelineRunSubmission" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "AiSkillReview" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "AiFindingGuidance" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "FindingDisposition" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "NotificationEvent" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "PolicyException" x WHERE x."repositoryId"=a."repositoryId" AND x."sourceSha"=a."sourceSha")
  AND NOT EXISTS (SELECT 1 FROM "RepositoryPullRequest" x WHERE x."repositoryId"=a."repositoryId" AND x.context::text LIKE '%'||a."sourceSha"||'%' AND NOT COALESCE((x.context->>'state') IN ('closed','CLOSED'),false))`,
      };
    case "sourceDays":
      return {
        table: "FindingSourceExcerpt",
        sql: Prisma.sql`SELECT a.id FROM "FindingSourceExcerpt" a WHERE a."repositoryId" IN (${scope}) AND COALESCE(a."capturedAt",a."createdAt")<${cutoff} AND a."retryAfter"<NOW()`,
      };
    case "notificationDays":
      return {
        table: "NotificationEvent",
        sql: Prisma.sql`SELECT a.id FROM "NotificationEvent" a WHERE a."organizationId"=${organizationId} AND a."createdAt"<${cutoff}
  AND (a."deliveredAt" IS NOT NULL OR a."failedAt" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "NotificationChannelDelivery" d WHERE d."eventId"=a.id AND (d.state NOT IN ('SENT','FAILED','SKIPPED') OR d."leaseUntil">NOW()))
  AND NOT EXISTS (SELECT 1 FROM "InboxNotification" n JOIN "NotificationEmailDelivery" d ON d."inboxId"=n.id WHERE n."eventId"=a.id AND (d.state NOT IN ('SENT','FAILED','SKIPPED') OR d."leaseUntil">NOW()))`,
      };
    case "activityDays":
      return {
        table: "ContributorObservation",
        sql: Prisma.sql`SELECT a.id FROM "ContributorObservation" a WHERE a."repositoryId" IN (${scope}) AND a."observedAt"<${cutoff}`,
      };
    case "auditDays":
      return {
        table: "AuditEvent",
        sql: Prisma.sql`SELECT a.id FROM "AuditEvent" a WHERE a.metadata->>'organizationId'=${organizationId} AND a."createdAt"<${cutoff}
  AND (a.event='authorization_denied' OR a.event LIKE 'notification.%' OR a.event LIKE 'retention.%')`,
      };
  }
}
