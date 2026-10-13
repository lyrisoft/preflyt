BEGIN;

-- CreateTable
CREATE TABLE "GitHubUserAccount" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "githubUserId" BIGINT NOT NULL,
    "identityId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubUserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubOrganizationLink" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "githubOrganizationId" BIGINT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubOrganizationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubUserCredential" (
    "accountId" TEXT NOT NULL,
    "encryptedTokens" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubUserCredential_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubUserAccount_host_githubUserId_key" ON "GitHubUserAccount"("host", "githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubUserAccount_identityId_host_key" ON "GitHubUserAccount"("identityId", "host");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOrganizationLink_organizationId_key" ON "GitHubOrganizationLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOrganizationLink_host_githubOrganizationId_key" ON "GitHubOrganizationLink"("host", "githubOrganizationId");

-- CreateIndex
CREATE INDEX "GitHubUserCredential_refreshExpiresAt_idx" ON "GitHubUserCredential"("refreshExpiresAt");

-- AddForeignKey
ALTER TABLE "GitHubUserAccount" ADD CONSTRAINT "GitHubUserAccount_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubOrganizationLink" ADD CONSTRAINT "GitHubOrganizationLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubUserCredential" ADD CONSTRAINT "GitHubUserCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GitHubUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stable IDs are positive; canonical hosts prevent duplicate links through casing.
ALTER TABLE "GitHubUserAccount" ADD CONSTRAINT "GitHubUserAccount_provider_key_check"
  CHECK ("githubUserId" > 0 AND "host" = lower("host") AND "host" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');
ALTER TABLE "GitHubOrganizationLink" ADD CONSTRAINT "GitHubOrganizationLink_provider_key_check"
  CHECK ("githubOrganizationId" > 0 AND "host" = lower("host") AND "host" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');
-- Catch accidental plaintext writes; cryptographic authenticity is checked by the cipher.
ALTER TABLE "GitHubUserCredential" ADD CONSTRAINT "GitHubUserCredential_envelope_check"
  CHECK (length("encryptedTokens") <= 24000 AND "encryptedTokens" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$');

COMMIT;
