CREATE TABLE "ContributorSyncState" (
 "repositoryId" TEXT PRIMARY KEY REFERENCES "GitHubRepository"("id") ON DELETE CASCADE,
 "installationId" TEXT NOT NULL,
 "accessRevision" INTEGER NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'QUEUED',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT,
 "leaseUntil" TIMESTAMP(3),
 "lastAttemptAt" TIMESTAMP(3),
 "lastSyncedAt" TIMESTAMP(3),
 "truncated" BOOLEAN NOT NULL DEFAULT false,
 "failureCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ContributorSyncState_state_check" CHECK ("state" IN ('QUEUED','RUNNING','SYNCED','PARTIAL','RETRY','FAILED'))
);
CREATE INDEX "ContributorSyncState_state_nextAttemptAt_idx" ON "ContributorSyncState"("state", "nextAttemptAt");
