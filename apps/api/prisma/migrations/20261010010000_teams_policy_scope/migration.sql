-- AlterTable
ALTER TABLE "RepositoryStandardsSelection" ADD COLUMN     "teamContext" JSONB;

-- CreateTable
CREATE TABLE "PreflytTeam" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "githubTeamId" TEXT,
    "githubOrganizationId" TEXT,
    "githubSlug" TEXT,
    "parentGithubTeamId" TEXT,
    "installationId" BIGINT,
    "importedMembers" JSONB NOT NULL DEFAULT '[]',
    "scopeRevision" INTEGER NOT NULL DEFAULT 1,
    "syncState" TEXT NOT NULL DEFAULT 'LOCAL',
    "syncedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreflytTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRepositoryScope" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "providerPresent" BOOLEAN NOT NULL DEFAULT true,
    "policyScopeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "TeamRepositoryScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPolicyAssignment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "branchRef" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "packs" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreflytTeam_organizationId_name_id_idx" ON "PreflytTeam"("organizationId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PreflytTeam_organizationId_githubTeamId_key" ON "PreflytTeam"("organizationId", "githubTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_membershipId_key" ON "TeamMember"("teamId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRepositoryScope_teamId_repositoryId_key" ON "TeamRepositoryScope"("teamId", "repositoryId");

-- CreateIndex
CREATE INDEX "TeamPolicyAssignment_teamId_branchRef_createdAt_idx" ON "TeamPolicyAssignment"("teamId", "branchRef", "createdAt");

-- AddForeignKey
ALTER TABLE "PreflytTeam" ADD CONSTRAINT "PreflytTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PreflytTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRepositoryScope" ADD CONSTRAINT "TeamRepositoryScope_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PreflytTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRepositoryScope" ADD CONSTRAINT "TeamRepositoryScope_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPolicyAssignment" ADD CONSTRAINT "TeamPolicyAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PreflytTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
