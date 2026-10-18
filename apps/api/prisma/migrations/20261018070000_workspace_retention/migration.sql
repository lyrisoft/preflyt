CREATE TABLE "WorkspaceRetention" (
 "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id") ON DELETE CASCADE,
 "revision" INTEGER NOT NULL DEFAULT 1, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "assessmentDays" INTEGER NOT NULL DEFAULT 90, "sourceDays" INTEGER NOT NULL DEFAULT 90,
 "notificationDays" INTEGER NOT NULL DEFAULT 90, "activityDays" INTEGER NOT NULL DEFAULT 90,
 "auditDays" INTEGER NOT NULL DEFAULT 365, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedById" TEXT, "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "lastRunAt" TIMESTAMP(3), "lastResult" JSONB,
 "lastError" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "WorkspaceRetention_enabled_nextRunAt_idx" ON "WorkspaceRetention"("enabled", "nextRunAt");
CREATE INDEX "GitHubCheckPublication_assessmentId_idx" ON "GitHubCheckPublication"("assessmentId");
CREATE INDEX "ReadinessTask_assessmentId_idx" ON "ReadinessTask"("assessmentId");
CREATE INDEX "PipelineRunSubmission_assessmentId_idx" ON "PipelineRunSubmission"("assessmentId");
CREATE INDEX "FindingDisposition_assessmentId_idx" ON "FindingDisposition"("assessmentId");
CREATE INDEX "AiFindingGuidance_assessmentId_idx" ON "AiFindingGuidance"("assessmentId");
CREATE INDEX "AiSkillReview_assessmentId_idx" ON "AiSkillReview"("assessmentId");
CREATE INDEX "NotificationEvent_organizationId_createdAt_idx" ON "NotificationEvent"("organizationId", "createdAt");
CREATE INDEX "AuditEvent_organization_createdAt_idx" ON "AuditEvent" ((metadata->>'organizationId'), "createdAt");
