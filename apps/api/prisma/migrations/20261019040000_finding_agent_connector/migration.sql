CREATE TABLE "FindingAgentGrant" (
  "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL,
  "identityId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
  "repositoryGithubId" TEXT NOT NULL, "origin" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL, "findingId" TEXT NOT NULL, "sourceSha" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "FindingAgentGrant_tokenHash_key" ON "FindingAgentGrant"("tokenHash");
CREATE INDEX "FindingAgentGrant_organizationId_identityId_findingId_idx" ON "FindingAgentGrant"("organizationId", "identityId", "findingId");
CREATE TABLE "FindingAgentEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY, "grantId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "content" JSONB NOT NULL, "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingAgentEvidence_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FindingAgentGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FindingAgentEvidence_grantId_requestKey_key" ON "FindingAgentEvidence"("grantId", "requestKey");
