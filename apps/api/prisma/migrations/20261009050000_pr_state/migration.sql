CREATE TABLE "RepositoryPullRequest" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL, "number" INTEGER NOT NULL, "objectId" TEXT NOT NULL,
 "context" JSONB NOT NULL, "sourceUpdatedAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1,
 "syncState" TEXT NOT NULL DEFAULT 'PENDING', "verifiedAt" TIMESTAMP(3), "lastSyncAttemptAt" TIMESTAMP(3),
 CONSTRAINT "RepositoryPullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryPullRequest_repositoryId_number_key" ON "RepositoryPullRequest"("repositoryId","number");
CREATE INDEX "RepositoryPullRequest_lastSyncAttemptAt_idx" ON "RepositoryPullRequest"("lastSyncAttemptAt");
