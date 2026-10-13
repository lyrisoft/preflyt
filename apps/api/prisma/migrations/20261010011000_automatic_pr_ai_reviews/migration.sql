ALTER TABLE "AiStageRoute" ADD COLUMN "automaticReviews" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "publishSummary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepositoryPullRequest" ADD COLUMN "aiReviewAttemptAt" TIMESTAMP(3);
ALTER TABLE "AiSkillReview" ADD COLUMN "automaticKey" TEXT, ADD COLUMN "feedbackState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED', ADD COLUMN "feedbackUrl" TEXT, ADD COLUMN "feedbackAttempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "feedbackAttemptAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "AiSkillReview_automaticKey_key" ON "AiSkillReview"("automaticKey");
