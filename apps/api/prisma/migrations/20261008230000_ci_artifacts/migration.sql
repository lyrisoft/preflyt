CREATE TABLE "CiArtifactImport" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "parserVersion" INTEGER NOT NULL DEFAULT 1,
  "verification" TEXT NOT NULL DEFAULT 'ADMIN_ASSOCIATED_UNVERIFIED',
  "content" BYTEA NOT NULL,
  "summary" JSONB NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CiArtifactImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CiArtifactImport_evidence_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ImportedCiEvidence"("deliveryId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CiArtifactImport_deliveryId_format_sha256_key" ON "CiArtifactImport"("deliveryId", "format", "sha256");
