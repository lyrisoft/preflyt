-- CreateEnum
CREATE TYPE "NativeExecutionState" AS ENUM ('BLOCKED', 'QUEUED', 'PREPARING', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- DropForeignKey
ALTER TABLE "GitHubRulesetDeployment" DROP CONSTRAINT "GitHubRulesetDeployment_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "ReadinessAutomation" DROP CONSTRAINT "ReadinessAutomation_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "ReadinessTask" DROP CONSTRAINT "ReadinessTask_repositoryId_fkey";

-- CreateTable
CREATE TABLE "NativeExecutionRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repositoryGithubId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "sourceSha" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "ruleIds" JSONB NOT NULL,
    "state" "NativeExecutionState" NOT NULL DEFAULT 'BLOCKED',
    "reason" TEXT,
    "runtimeApprovalHash" TEXT,
    "sourceHash" TEXT,
    "environmentId" TEXT,
    "controllerJobId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledById" TEXT,
    "finishedAt" TIMESTAMP(3),
    "receiptHash" TEXT,

    CONSTRAINT "NativeExecutionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NativeExecutionRequest_organizationId_repositoryId_requeste_idx" ON "NativeExecutionRequest"("organizationId", "repositoryId", "requestedAt", "id");

-- CreateIndex
CREATE INDEX "NativeExecutionRequest_state_leaseUntil_requestedAt_idx" ON "NativeExecutionRequest"("state", "leaseUntil", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NativeExecutionRequest_repositoryId_requestKey_key" ON "NativeExecutionRequest"("repositoryId", "requestKey");

-- AddForeignKey
ALTER TABLE "ReadinessAutomation" ADD CONSTRAINT "ReadinessAutomation_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessTask" ADD CONSTRAINT "ReadinessTask_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubRulesetDeployment" ADD CONSTRAINT "GitHubRulesetDeployment_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NativeExecutionRequest" ADD CONSTRAINT "NativeExecutionRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "GitHubCheckPublication_organizationId_repositoryId_createdAt_id" RENAME TO "GitHubCheckPublication_organizationId_repositoryId_createdA_idx";

-- RenameIndex
ALTER INDEX "GitHubRulesetDeployment_repositoryId_organizationId_createdAt_i" RENAME TO "GitHubRulesetDeployment_repositoryId_organizationId_created_idx";

-- RenameIndex
ALTER INDEX "ImportedCiEvidence_repositoryGithubId_installationId_observedAt" RENAME TO "ImportedCiEvidence_repositoryGithubId_installationId_observ_idx";

ALTER TABLE "NativeExecutionRequest" ADD CONSTRAINT "NativeExecutionRequest_hashes_check" CHECK (
  "sourceSha" ~ '^[a-f0-9]{40}$' AND "planHash" ~ '^[a-f0-9]{64}$' AND "inputHash" ~ '^[a-f0-9]{64}$'
  AND "repositoryGithubId" ~ '^[1-9][0-9]{0,15}$'
  AND "requestKey" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  AND jsonb_typeof("ruleIds") = 'array' AND jsonb_array_length("ruleIds") BETWEEN 1 AND 16
);
