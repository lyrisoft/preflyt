CREATE TABLE "GitHubDisplayRead" (
  "key" TEXT PRIMARY KEY, "generation" INTEGER NOT NULL DEFAULT 0, "installationId" BIGINT NOT NULL, "repositoryGithubId" BIGINT NOT NULL,
  "accessRevision" INTEGER NOT NULL, "fingerprint" TEXT NOT NULL, "operation" TEXT NOT NULL,
  "args" JSONB NOT NULL, "value" JSONB, "fetchedAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "state" TEXT NOT NULL DEFAULT 'PENDING', "errorCode" TEXT
);
CREATE INDEX "GitHubDisplayRead_state_nextAttemptAt_idx" ON "GitHubDisplayRead"("state", "nextAttemptAt");
CREATE INDEX "GitHubDisplayRead_installationId_repositoryGithubId_idx" ON "GitHubDisplayRead"("installationId", "repositoryGithubId");
