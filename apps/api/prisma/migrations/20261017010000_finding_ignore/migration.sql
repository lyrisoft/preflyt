CREATE TABLE "FindingIgnore" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "repositoryGithubId" TEXT NOT NULL,
 "state" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3),
 "revision" INTEGER NOT NULL DEFAULT 1,
 "updatedById" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FindingIgnore_organizationId_repositoryGithubId_idx" ON "FindingIgnore"("organizationId", "repositoryGithubId");
