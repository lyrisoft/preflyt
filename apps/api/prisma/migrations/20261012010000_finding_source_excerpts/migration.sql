CREATE TABLE "FindingSourceExcerpt" (
 "id" TEXT NOT NULL,
 "repositoryId" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL,
 "path" TEXT NOT NULL,
 "line" INTEGER,
 "endLine" INTEGER,
 "contextLines" INTEGER NOT NULL DEFAULT 8,
 "version" INTEGER NOT NULL DEFAULT 1,
 "content" JSONB,
 "contentHash" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "retryAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "capturedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FindingSourceExcerpt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FindingSourceExcerpt_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FindingSourceExcerpt_contentHash_attempts_retryAfter_idx" ON "FindingSourceExcerpt"("contentHash", "attempts", "retryAfter");
CREATE INDEX "FindingSourceExcerpt_repositoryId_sourceSha_idx" ON "FindingSourceExcerpt"("repositoryId", "sourceSha");
