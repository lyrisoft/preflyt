CREATE TABLE "GitHubConnectionTransaction" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "organizationId" TEXT,
  "phase" TEXT NOT NULL DEFAULT 'INSTALLATION',
  "installationId" BIGINT,
  "codeVerifier" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubConnectionTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GitHubConnectionTransaction_stateHash_key" ON "GitHubConnectionTransaction"("stateHash");
CREATE INDEX "GitHubConnectionTransaction_expiresAt_idx" ON "GitHubConnectionTransaction"("expiresAt");
ALTER TABLE "GitHubInstallation" ADD COLUMN "repositoryTracking" TEXT NOT NULL DEFAULT 'EXPLICIT';
