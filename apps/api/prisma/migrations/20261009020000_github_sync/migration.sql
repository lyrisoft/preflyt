ALTER TABLE "GitHubInstallation" ADD COLUMN "accessRevision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "syncState" TEXT NOT NULL DEFAULT 'UNKNOWN', ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3), ADD COLUMN "syncLeaseUntil" TIMESTAMP(3);
CREATE TABLE "GitHubAccessDelivery" (
 "id" TEXT PRIMARY KEY, "payloadHash" TEXT NOT NULL, "installationId" BIGINT NOT NULL,
 "event" TEXT NOT NULL, "action" TEXT NOT NULL, "state" "GitHubDeliveryState" NOT NULL DEFAULT 'RECEIVED',
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3)
);
CREATE INDEX "GitHubAccessDelivery_state_receivedAt_idx" ON "GitHubAccessDelivery"("state", "receivedAt");

ALTER TABLE "GitHubRepository" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
