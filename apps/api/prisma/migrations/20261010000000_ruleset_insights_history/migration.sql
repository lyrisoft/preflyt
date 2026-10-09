CREATE TABLE "GitHubRuleSuiteSnapshot" (
 "id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "suiteId" BIGINT NOT NULL,
 "rulesetIds" BIGINT[] NOT NULL, "actor" TEXT NOT NULL, "ref" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL, "pushedAt" TIMESTAMP(3) NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL,
 "raw" JSONB NOT NULL, "digest" TEXT NOT NULL,
 CONSTRAINT "GitHubRuleSuiteSnapshot_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GitHubRuleSuiteSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GitHubRuleSuiteSnapshot_repositoryId_suiteId_key" ON "GitHubRuleSuiteSnapshot"("repositoryId", "suiteId");
CREATE INDEX "GitHubRuleSuiteSnapshot_repositoryId_pushedAt_suiteId_idx" ON "GitHubRuleSuiteSnapshot"("repositoryId", "pushedAt", "suiteId");
CREATE TABLE "GitHubInsightsSync" (
 "repositoryId" TEXT NOT NULL, "nextPage" INTEGER NOT NULL DEFAULT 1,
 "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseId" TEXT,
 "leaseUntil" TIMESTAMP(3), "lastFetchedAt" TIMESTAMP(3), "lastSweepAt" TIMESTAMP(3),
 "error" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "GitHubInsightsSync_pkey" PRIMARY KEY ("repositoryId"),
 CONSTRAINT "GitHubInsightsSync_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GitHubInsightsSync_nextRunAt_idx" ON "GitHubInsightsSync"("nextRunAt");
