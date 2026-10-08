CREATE TABLE "RepositoryStandardsSelection" (
  "id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "profile" TEXT NOT NULL, "packs" JSONB NOT NULL, "selectedById" TEXT NOT NULL,
  "profileSnapshotId" TEXT, "sourceSha" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryStandardsSelection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RepositoryStandardsSelection_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryStandardsSelection_repositoryId_revision_key" ON "RepositoryStandardsSelection"("repositoryId", "revision");
