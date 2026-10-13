-- AlterTable
ALTER TABLE "AiProviderConnection" ADD COLUMN     "inputPriceCentsPerMillion" INTEGER,
ADD COLUMN     "outputPriceCentsPerMillion" INTEGER;

-- CreateTable
CREATE TABLE "AiReviewSkill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "stages" TEXT[],
    "repositories" TEXT[],
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReviewSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSkillReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reservedMicroCents" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "failure" TEXT,
    "providerId" TEXT,
    "latencyMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSkillReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReviewBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "reservedMicroCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AiReviewBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReviewSkill_organizationId_createdAt_idx" ON "AiReviewSkill"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiReviewSkill_organizationId_skillKey_version_key" ON "AiReviewSkill"("organizationId", "skillKey", "version");

-- CreateIndex
CREATE INDEX "AiSkillReview_state_createdAt_idx" ON "AiSkillReview"("state", "createdAt");

-- CreateIndex
CREATE INDEX "AiSkillReview_organizationId_repositoryId_assessmentId_crea_idx" ON "AiSkillReview"("organizationId", "repositoryId", "assessmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSkillReview_organizationId_actorId_fingerprint_key" ON "AiSkillReview"("organizationId", "actorId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AiReviewBudget_organizationId_stage_day_key" ON "AiReviewBudget"("organizationId", "stage", "day");

-- AddForeignKey
ALTER TABLE "AiReviewSkill" ADD CONSTRAINT "AiReviewSkill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkillReview" ADD CONSTRAINT "AiSkillReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkillReview" ADD CONSTRAINT "AiSkillReview_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkillReview" ADD CONSTRAINT "AiSkillReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CommitAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewBudget" ADD CONSTRAINT "AiReviewBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

