CREATE TABLE "GitHubAccessRefresh" (
 "key" TEXT PRIMARY KEY, "identityId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "value" JSONB, "fetchedAt" TIMESTAMP(3), "state" TEXT NOT NULL DEFAULT 'PENDING',
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3)
);
CREATE INDEX "GitHubAccessRefresh_state_nextAttemptAt_idx" ON "GitHubAccessRefresh"("state", "nextAttemptAt");
