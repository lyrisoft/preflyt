CREATE TABLE "CommitAssessment" (
  "id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "sourceSha" TEXT NOT NULL,
  "selectionId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
  "request" JSONB NOT NULL, "plan" JSONB NOT NULL, "report" JSONB NOT NULL,
  "assessmentHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommitAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommitAssessment_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommitAssessment_repositoryId_requestKey_key" ON "CommitAssessment"("repositoryId", "requestKey");
CREATE INDEX "CommitAssessment_repositoryId_sourceSha_createdAt_idx" ON "CommitAssessment"("repositoryId", "sourceSha", "createdAt");
CREATE INDEX "CommitAssessment_repositoryId_createdAt_idx" ON "CommitAssessment"("repositoryId", "createdAt");
