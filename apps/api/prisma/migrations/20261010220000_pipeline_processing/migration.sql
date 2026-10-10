ALTER TABLE "ReadinessAutomation" ADD COLUMN "pipelineComments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PipelineRunSubmission" ADD COLUMN "assessmentId" TEXT, ADD COLUMN "commentUrl" TEXT, ADD COLUMN "failureCode" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "leaseToken" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3);
CREATE INDEX "PipelineRunSubmission_nextAttemptAt_idx" ON "PipelineRunSubmission"("nextAttemptAt");
