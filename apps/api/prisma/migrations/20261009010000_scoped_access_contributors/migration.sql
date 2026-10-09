BEGIN;

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'POLICY_MANAGER', 'SECURITY_ENGINEER', 'ENGINEERING_LEAD', 'DEVELOPER', 'AUDITOR', 'VIEWER');

-- AlterTable
ALTER TABLE "WebSession" ADD COLUMN     "activeOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "GitHubSetupTransaction" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'preflyt-default';

-- AlterTable
ALTER TABLE "GitHubInstallation" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'preflyt-default';

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryGrant" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorDelivery" (
    "id" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributorDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorObservation" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "sourceSha" TEXT NOT NULL,
    "pullRequestNumber" INTEGER,
    "action" TEXT NOT NULL,
    "state" TEXT,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributorObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_identityId_key" ON "OrganizationMembership"("organizationId", "identityId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryGrant_membershipId_repositoryId_key" ON "RepositoryGrant"("membershipId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_installationId_githubUserId_key" ON "Contributor"("installationId", "githubUserId");

-- CreateIndex
CREATE INDEX "ContributorObservation_repositoryId_observedAt_idx" ON "ContributorObservation"("repositoryId", "observedAt");

-- CreateIndex
CREATE INDEX "ContributorObservation_contributorId_observedAt_idx" ON "ContributorObservation"("contributorId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContributorObservation_deliveryId_contributorId_relationshi_key" ON "ContributorObservation"("deliveryId", "contributorId", "relationship", "sourceObjectId");

-- Explicit compatibility grants for the existing single-deployment workspace.
INSERT INTO "Organization" ("id", "name") VALUES ('preflyt-default', 'Preflyt workspace');
INSERT INTO "OrganizationMembership" ("id", "organizationId", "identityId", "role", "active", "updatedAt")
SELECT 'migrated-' || "id", 'preflyt-default', "identityId",
CASE WHEN "role" = 'SUPER_ADMIN' THEN 'OWNER'::"OrganizationRole" ELSE "role"::text::"OrganizationRole" END, "active", NOW() FROM "Membership";
INSERT INTO "RepositoryGrant" ("id", "membershipId", "repositoryId")
SELECT 'migrated-' || m."id" || '-' || r."id", m."id", r."id" FROM "OrganizationMembership" m CROSS JOIN "GitHubRepository" r WHERE m."role" NOT IN ('OWNER','ADMIN');
UPDATE "WebSession" SET "activeOrganizationId" = 'preflyt-default';
INSERT INTO "AuditEvent" ("id", "event", "metadata") VALUES ('scoped-access-migration', 'organization_access_migrated', '{"organizationId":"preflyt-default","reason":"explicit compatibility grants for prior deployment-wide access"}');

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryGrant" ADD CONSTRAINT "RepositoryGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryGrant" ADD CONSTRAINT "RepositoryGrant_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorObservation" ADD CONSTRAINT "ContributorObservation_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorObservation" ADD CONSTRAINT "ContributorObservation_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
