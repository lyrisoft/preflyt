-- CreateTable
CREATE TABLE "GatePolicyRevision" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchRef" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "selectionId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "GatePolicyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatePolicyRevision_organizationId_repositoryId_createdAt_idx" ON "GatePolicyRevision"("organizationId", "repositoryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GatePolicyRevision_repositoryId_branchRef_revision_key" ON "GatePolicyRevision"("repositoryId", "branchRef", "revision");

-- AddForeignKey
ALTER TABLE "GatePolicyRevision" ADD CONSTRAINT "GatePolicyRevision_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
