-- CreateTable
CREATE TABLE "OrganizationStandardVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationStandardVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationStandardVersion_organizationId_createdAt_idx" ON "OrganizationStandardVersion"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationStandardVersion_organizationId_packId_revision_key" ON "OrganizationStandardVersion"("organizationId", "packId", "revision");
