ALTER TABLE "RepositoryHealthTarget" ADD COLUMN "includeAiSecurity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepositoryHealthAssessment" ADD COLUMN "parentId" TEXT;
CREATE INDEX "RepositoryHealthAssessment_parentId_idx" ON "RepositoryHealthAssessment"("parentId");
ALTER TABLE "RepositoryHealthAssessment" ADD CONSTRAINT "RepositoryHealthAssessment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "RepositoryHealthAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
