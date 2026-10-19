CREATE TABLE "AiModelUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerRevision" INTEGER NOT NULL,
  "modelId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "workload" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RUNNING',
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "cachedTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AiModelUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiModelUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiModelUsage_counts" CHECK (("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0) AND ("cachedTokens" IS NULL OR "cachedTokens" >= 0))
);
CREATE INDEX "AiModelUsage_organizationId_providerId_createdAt_idx" ON "AiModelUsage"("organizationId", "providerId", "createdAt");
CREATE INDEX "AiModelUsage_organizationId_workload_sourceId_idx" ON "AiModelUsage"("organizationId", "workload", "sourceId");
CREATE INDEX "RepositoryHealthStrixRun_providerId_createdAt_idx" ON "RepositoryHealthStrixRun"("providerId", "createdAt");
