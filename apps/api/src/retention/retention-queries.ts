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
  -- Keep one latest row per branch without comparing every pair of old rows.
  WITH latest AS MATERIALIZED (
    SELECT DISTINCT ON ("repositoryId",request->'baseContext'->>'ref') id
    FROM "CommitAssessment" WHERE "repositoryId" IN (${scope})
    ORDER BY "repositoryId",request->'baseContext'->>'ref',"createdAt" DESC,id DESC
  )
  SELECT a.id FROM "CommitAssessment" a WHERE a."repositoryId" IN (${scope}) AND a."createdAt"<${cutoff}
  AND NOT EXISTS (SELECT 1 FROM latest WHERE latest.id=a.id)
  AND NOT EXISTS (SELECT 1 FROM "GitHubCheckPublication" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "ReadinessTask" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "PipelineRunSubmission" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "AiSkillReview" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "AiFindingGuidance" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "FindingDisposition" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "NotificationEvent" x WHERE x."assessmentId"=a.id)
  AND NOT EXISTS (SELECT 1 FROM "PolicyException" x WHERE x."repositoryId"=a."repositoryId" AND x."sourceSha"=a."sourceSha")
  AND a."sourceSha" ~ '^[0-9a-fA-F]{40}$'
  AND NOT EXISTS (SELECT 1 FROM "RepositoryPullRequest" x WHERE x."repositoryId"=a."repositoryId" AND NOT x."retentionReferencesComplete" AND NOT COALESCE((x.context->>'state') IN ('closed','CLOSED'),false))
  AND NOT EXISTS (SELECT 1 FROM "PullRequestRetentionCommit" ref JOIN "RepositoryPullRequest" x ON x.id=ref."pullRequestId"
    WHERE ref."repositoryId"=a."repositoryId" AND ref."sourceSha"=a."sourceSha" AND x."repositoryId"=a."repositoryId"
    AND NOT COALESCE((x.context->>'state') IN ('closed','CLOSED'),false))`,
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
