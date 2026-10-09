BEGIN;

-- AlterTable
ALTER TABLE "GatePolicyRevision" ADD COLUMN     "approvalKind" TEXT NOT NULL DEFAULT 'INDEPENDENT';

-- CreateTable
CREATE TABLE "GitHubLoginTransaction" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "browserBindingHash" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubLoginTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubOnboardingChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubOnboardingChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubUserAccessEvidence" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "accessRevision" INTEGER NOT NULL,
    "repositoryGithubIds" BIGINT[],
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubUserAccessEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubLoginTransaction_stateHash_key" ON "GitHubLoginTransaction"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubLoginTransaction_expiresAt_idx" ON "GitHubLoginTransaction"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOnboardingChallenge_tokenHash_key" ON "GitHubOnboardingChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "GitHubOnboardingChallenge_expiresAt_idx" ON "GitHubOnboardingChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "GitHubUserAccessEvidence_expiresAt_idx" ON "GitHubUserAccessEvidence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubUserAccessEvidence_accountId_organizationId_key" ON "GitHubUserAccessEvidence"("accountId", "organizationId");

-- AddForeignKey
ALTER TABLE "GitHubOnboardingChallenge" ADD CONSTRAINT "GitHubOnboardingChallenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GitHubUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubUserAccessEvidence" ADD CONSTRAINT "GitHubUserAccessEvidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GitHubUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubUserAccessEvidence" ADD CONSTRAINT "GitHubUserAccessEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
