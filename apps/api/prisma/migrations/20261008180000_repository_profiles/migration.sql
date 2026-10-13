CREATE TABLE "RepositoryProfile" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "sourceSha" TEXT NOT NULL,
    "treeSha" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepositoryProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepositoryProfile_repositoryId_createdAt_idx" ON "RepositoryProfile"("repositoryId", "createdAt");
ALTER TABLE "RepositoryProfile" ADD CONSTRAINT "RepositoryProfile_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
