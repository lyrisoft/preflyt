ALTER TABLE "NativeExecutionRequest" ADD COLUMN "healthAssessmentId" TEXT;
CREATE UNIQUE INDEX "NativeExecutionRequest_healthAssessmentId_key" ON "NativeExecutionRequest"("healthAssessmentId");
ALTER TABLE "NotificationEvent" ADD COLUMN "healthAssessmentId" TEXT, ADD COLUMN "branchRef" TEXT;
CREATE UNIQUE INDEX "NotificationEvent_healthAssessmentId_key" ON "NotificationEvent"("healthAssessmentId");
CREATE TABLE "RepositoryHealthTarget" (
 "repositoryId" TEXT PRIMARY KEY REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "organizationId" TEXT NOT NULL, "branch" TEXT NOT NULL, "headSha" TEXT, "headCheckedAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1,
 "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "RepositoryHealthAssessment" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "organizationId" TEXT NOT NULL, "branch" TEXT NOT NULL, "targetRevision" INTEGER NOT NULL,
 "requestKey" TEXT NOT NULL, "actorId" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'QUEUED',
 "sourceSha" TEXT, "profileId" TEXT, "plan" JSONB, "report" JSONB, "reason" TEXT, "nativeRequestId" TEXT,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
 "cancelledAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RepositoryHealthAssessment_repositoryId_requestKey_key" ON "RepositoryHealthAssessment"("repositoryId", "requestKey");
CREATE UNIQUE INDEX "RepositoryHealthAssessment_nativeRequestId_key" ON "RepositoryHealthAssessment"("nativeRequestId");
CREATE INDEX "RepositoryHealthAssessment_repositoryId_branch_createdAt_id_idx" ON "RepositoryHealthAssessment"("repositoryId", "branch", "createdAt", "id");
CREATE INDEX "RepositoryHealthAssessment_organizationId_state_leaseUntil_idx" ON "RepositoryHealthAssessment"("organizationId", "state", "leaseUntil");
