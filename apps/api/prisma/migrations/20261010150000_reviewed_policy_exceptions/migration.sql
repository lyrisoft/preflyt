CREATE TABLE "PolicyException" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE RESTRICT,
  "policyId" TEXT NOT NULL REFERENCES "GatePolicyRevision"("id") ON DELETE RESTRICT,
  "policyHash" TEXT NOT NULL,
  "branchRef" TEXT NOT NULL,
  "sourceSha" TEXT NOT NULL,
  "ruleIds" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "revokedById" TEXT,
  "state" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestHash" TEXT NOT NULL UNIQUE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("state" IN ('REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED')),
  CHECK ("sourceSha" ~ '^[a-f0-9]{40}$'),
  CHECK ("policyHash" ~ '^[a-f0-9]{64}$'),
  CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  CHECK ("expiresAt" > "createdAt"),
  CHECK (jsonb_typeof("ruleIds") = 'array'),
  CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById"),
  CHECK ("state" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
);
CREATE INDEX "PolicyException_organizationId_repositoryId_createdAt_idx" ON "PolicyException"("organizationId", "repositoryId", "createdAt");
CREATE INDEX "PolicyException_repositoryId_policyId_sourceSha_state_idx" ON "PolicyException"("repositoryId", "policyId", "sourceSha", "state");
CREATE INDEX "PolicyException_state_expiresAt_idx" ON "PolicyException"("state", "expiresAt");
