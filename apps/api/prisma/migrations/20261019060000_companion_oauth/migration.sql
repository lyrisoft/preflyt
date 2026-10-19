CREATE TABLE "CompanionAuthorization" (
 "id" TEXT PRIMARY KEY, "challenge" TEXT NOT NULL, "state" TEXT NOT NULL, "redirectUri" TEXT NOT NULL,
 "resource" TEXT NOT NULL, "name" TEXT NOT NULL, "agents" JSONB NOT NULL, "repositories" JSONB NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "codeHash" TEXT UNIQUE, "identityId" TEXT, "organizationId" TEXT, "approvedRepositories" JSONB, "consumedAt" TIMESTAMP(3)
);
CREATE TABLE "CompanionConnection" (
 "id" TEXT PRIMARY KEY, "identityId" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "agents" JSONB NOT NULL, "repositories" JSONB NOT NULL, "accessHash" TEXT NOT NULL UNIQUE, "refreshHash" TEXT NOT NULL UNIQUE,
 "accessExpiresAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "CompanionConnection_identityId_organizationId_idx" ON "CompanionConnection"("identityId", "organizationId");
CREATE TABLE "CompanionJob" (
 "id" TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "CompanionConnection"("id") ON DELETE CASCADE,
 "requestKey" TEXT NOT NULL, "scope" JSONB NOT NULL, "sourceSha" TEXT NOT NULL, "agent" TEXT NOT NULL, "mode" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'QUEUED', "grantId" TEXT, "failure" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "cancelRequested" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "CompanionJob_connectionId_requestKey_key" ON "CompanionJob"("connectionId", "requestKey");
CREATE INDEX "CompanionJob_connectionId_state_idx" ON "CompanionJob"("connectionId", "state");
