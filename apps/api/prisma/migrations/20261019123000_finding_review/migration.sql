CREATE TABLE "FindingReview" (
 "id" TEXT PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "repositoryGithubId" TEXT NOT NULL,
 "assessmentId" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL,
 "findingId" TEXT NOT NULL,
 "classification" TEXT NOT NULL CHECK ("classification" IN ('POTENTIAL','LIKELY','CONFIRMED','FALSE_POSITIVE')),
 "reason" TEXT NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 4000),
 "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedById" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FindingReview_organizationId_repositoryGithubId_assessmentId_s_idx" ON "FindingReview" ("organizationId","repositoryGithubId","assessmentId","sourceSha");
