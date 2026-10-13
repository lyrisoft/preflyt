CREATE TABLE "AiProviderConnection" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "endpointId" TEXT NOT NULL, "modelId" TEXT NOT NULL,
  "encryptedCredential" TEXT, "credentialEndpointDigest" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1, "testStatus" TEXT NOT NULL DEFAULT 'NOT_TESTED',
  "testedAt" TIMESTAMP(3), "testedRevision" INTEGER, "testedEndpointDigest" TEXT,
  "createdById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AiProviderConnection_organizationId_updatedAt_idx" ON "AiProviderConnection"("organizationId", "updatedAt");
CREATE TABLE "AiStageRoute" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "stage" TEXT NOT NULL,
  "primaryId" TEXT, "fallbackId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "allowSource" BOOLEAN NOT NULL DEFAULT false, "maxInputTokens" INTEGER NOT NULL DEFAULT 8000,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 1000, "dailyBudgetCents" INTEGER NOT NULL DEFAULT 1000,
  "revision" INTEGER NOT NULL DEFAULT 1, "updatedById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AiStageRoute_organizationId_stage_key" ON "AiStageRoute"("organizationId", "stage");

ALTER TABLE "AiProviderConnection" ADD CONSTRAINT "AiProviderConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiStageRoute" ADD CONSTRAINT "AiStageRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
