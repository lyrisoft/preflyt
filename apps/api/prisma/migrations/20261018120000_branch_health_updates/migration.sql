CREATE TABLE "RepositoryBranchRun" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE,
 "organizationId" TEXT NOT NULL, "branch" TEXT NOT NULL, "sourceSha" TEXT NOT NULL,
 "runId" TEXT NOT NULL, "runAttempt" INTEGER NOT NULL, "workflowId" TEXT NOT NULL,
 "policyId" TEXT NOT NULL, "policyHash" TEXT NOT NULL, "configRevision" INTEGER NOT NULL,
 "actorId" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING', "failureCode" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "RepositoryBranchRun_state_nextAttemptAt_idx" ON "RepositoryBranchRun"("state", "nextAttemptAt");
CREATE INDEX "RepositoryBranchRun_repositoryId_branch_createdAt_idx" ON "RepositoryBranchRun"("repositoryId", "branch", "createdAt");
CREATE TABLE "RepositoryHealthRefresh" (
 "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE, "branch" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("repositoryId", "branch")
);
CREATE INDEX "RepositoryHealthRefresh_nextAttemptAt_idx" ON "RepositoryHealthRefresh"("nextAttemptAt");
