-- CreateEnum
CREATE TYPE "GitHubSetupPhase" AS ENUM ('INSTALLATION', 'USER_AUTHORIZATION');

-- CreateTable
CREATE TABLE "GitHubSetupTransaction" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "browserBindingHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "phase" "GitHubSetupPhase" NOT NULL DEFAULT 'INSTALLATION',
    "installationId" BIGINT,
    "codeVerifier" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubSetupTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" BIGINT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "repositorySelection" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "connectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubRepository" (
    "id" TEXT NOT NULL,
    "githubId" BIGINT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "ownerLogin" TEXT NOT NULL,
    "defaultBranch" TEXT,
    "isPrivate" BOOLEAN NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubSetupTransaction_stateHash_key" ON "GitHubSetupTransaction"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubSetupTransaction_expiresAt_idx" ON "GitHubSetupTransaction"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubRepository_githubId_key" ON "GitHubRepository"("githubId");

-- CreateIndex
CREATE INDEX "GitHubRepository_installationId_selected_idx" ON "GitHubRepository"("installationId", "selected");

-- AddForeignKey
ALTER TABLE "GitHubSetupTransaction" ADD CONSTRAINT "GitHubSetupTransaction_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "Identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubRepository" ADD CONSTRAINT "GitHubRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
