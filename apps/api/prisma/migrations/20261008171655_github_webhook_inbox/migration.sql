-- CreateEnum
CREATE TYPE "GitHubDeliveryState" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "GitHubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "repositoryGithubId" BIGINT NOT NULL,
    "sourceSha" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "sourceNumber" INTEGER,
    "sourceStatus" TEXT,
    "sourceConclusion" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "state" "GitHubDeliveryState" NOT NULL DEFAULT 'RECEIVED',
    "reason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_state_receivedAt_idx" ON "GitHubWebhookDelivery"("state", "receivedAt");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_repositoryGithubId_receivedAt_idx" ON "GitHubWebhookDelivery"("repositoryGithubId", "receivedAt");
