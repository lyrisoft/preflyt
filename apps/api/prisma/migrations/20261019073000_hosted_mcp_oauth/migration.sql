CREATE TABLE "McpOAuthClient" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "redirectUris" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "McpOAuthAuthorization" (
 "id" TEXT PRIMARY KEY, "clientId" TEXT NOT NULL, "redirectUri" TEXT NOT NULL, "resource" TEXT NOT NULL, "challenge" TEXT NOT NULL,
 "state" TEXT NOT NULL, "scopes" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "codeHash" TEXT UNIQUE, "identityId" TEXT, "organizationId" TEXT, "repositories" JSONB, "consumedAt" TIMESTAMP(3)
);
CREATE TABLE "McpOAuthConnection" (
 "id" TEXT PRIMARY KEY, "clientId" TEXT NOT NULL, "clientName" TEXT NOT NULL, "identityId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "repositories" JSONB NOT NULL, "scopes" TEXT NOT NULL, "resource" TEXT NOT NULL, "accessHash" TEXT NOT NULL UNIQUE, "refreshHash" TEXT NOT NULL UNIQUE,
 "accessExpiresAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "McpOAuthConnection_identityId_organizationId_idx" ON "McpOAuthConnection"("identityId", "organizationId");
ALTER TABLE "FindingAgentGrant" ADD COLUMN "oauthConnectionId" TEXT;
CREATE UNIQUE INDEX "FindingAgentGrant_oauth_scope_key" ON "FindingAgentGrant"("oauthConnectionId", "repositoryGithubId", "origin", "assessmentId", "findingId");
