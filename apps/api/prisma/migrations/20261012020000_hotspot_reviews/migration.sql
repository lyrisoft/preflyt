CREATE TABLE "RepositoryHealthHotspotReview" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "repositoryId" TEXT NOT NULL,
 "assessmentId" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'TO_REVIEW',
 "note" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedById" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RepositoryHealthHotspotReview_state_check" CHECK ("state" IN ('TO_REVIEW','IN_REVIEW','SAFE','FIX_REQUIRED')),
 CONSTRAINT "RepositoryHealthHotspotReview_note_check" CHECK (char_length("note") <= 1000 AND ("state" NOT IN ('SAFE','FIX_REQUIRED') OR char_length(trim("note")) > 0)),
 CONSTRAINT "RepositoryHealthHotspotReview_revision_check" CHECK ("revision" > 0),
 CONSTRAINT "RepositoryHealthHotspotReview_fingerprint_check" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "RepositoryHealthHotspotReview_sourceSha_check" CHECK ("sourceSha" ~ '^[a-f0-9]{40}$'),
 CONSTRAINT "RepositoryHealthHotspotReview_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "RepositoryHealthHotspotReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RepositoryHealthAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryHealthHotspotReview_assessmentId_fingerprint_key" ON "RepositoryHealthHotspotReview"("assessmentId","fingerprint");
CREATE INDEX "RepositoryHealthHotspotReview_organizationId_repositoryId_assessmentId_idx" ON "RepositoryHealthHotspotReview"("organizationId","repositoryId","assessmentId");
