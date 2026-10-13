CREATE TYPE "ImportedCiResult" AS ENUM ('SUCCEEDED', 'FAILED', 'PENDING', 'NOT_EXECUTED', 'UNKNOWN');
CREATE TABLE "ImportedCiEvidence" (
  "deliveryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "repositoryGithubId" BIGINT NOT NULL,
  "installationId" BIGINT NOT NULL,
  "sourceSha" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceObjectId" TEXT NOT NULL,
  "sourceAction" TEXT NOT NULL,
  "sourceStatus" TEXT,
  "sourceConclusion" TEXT,
  "sourceUpdatedAt" TIMESTAMP(3),
  "result" "ImportedCiResult" NOT NULL,
  "sourcePayloadHash" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportedCiEvidence_pkey" PRIMARY KEY ("deliveryId")
);
CREATE INDEX "ImportedCiEvidence_repositoryGithubId_installationId_observedAt_idx" ON "ImportedCiEvidence"("repositoryGithubId", "installationId", "observedAt");
CREATE INDEX "ImportedCiEvidence_repositoryGithubId_sourceSha_observedAt_idx" ON "ImportedCiEvidence"("repositoryGithubId", "sourceSha", "observedAt");
ALTER TABLE "ImportedCiEvidence" ADD CONSTRAINT "ImportedCiEvidence_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "GitHubWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
