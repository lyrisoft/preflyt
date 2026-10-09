CREATE TABLE "GitHubCheckPublication" (
"id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
"assessmentId" TEXT NOT NULL, "prNumber" INTEGER NOT NULL, "sourceSha" TEXT NOT NULL,
"installationId" TEXT NOT NULL, "previewHash" TEXT NOT NULL, "conclusion" TEXT NOT NULL,
"state" TEXT NOT NULL DEFAULT 'PUBLISHING', "leaseToken" TEXT NOT NULL, "actorId" TEXT NOT NULL,
"checkRunId" TEXT, "appId" TEXT, "htmlUrl" TEXT, "verifiedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "GitHubCheckPublication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GitHubCheckPublication_organizationId_repositoryId_createdAt_idx" ON "GitHubCheckPublication"("organizationId", "repositoryId", "createdAt");
ALTER TABLE "GitHubCheckPublication" ADD CONSTRAINT "GitHubCheckPublication_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
