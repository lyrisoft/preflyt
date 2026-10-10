CREATE TABLE "PipelineRunSubmission" (
 "id" TEXT NOT NULL PRIMARY KEY, "repositoryId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "policyId" TEXT NOT NULL, "policyHash" TEXT NOT NULL, "sourceSha" TEXT NOT NULL, "workflowSha" TEXT NOT NULL,
 "runId" TEXT NOT NULL, "runAttempt" INTEGER NOT NULL, "prNumber" INTEGER NOT NULL,
 "inputHash" TEXT NOT NULL, "payload" JSONB NOT NULL, "submittedById" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PipelineRunSubmission_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PipelineRunSubmission_repositoryId_createdAt_idx" ON "PipelineRunSubmission"("repositoryId", "createdAt");
CREATE INDEX "PipelineRunSubmission_state_createdAt_idx" ON "PipelineRunSubmission"("state", "createdAt");
