CREATE TABLE "CiArtifactAttestation" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "bundle" BYTEA NOT NULL,
  "bundleSha256" TEXT NOT NULL,
  "policyDigest" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  "claims" JSONB NOT NULL,
  "verifiedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CiArtifactAttestation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CiArtifactAttestation_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "CiArtifactImport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CiArtifactAttestation_artifactId_policyDigest_key" ON "CiArtifactAttestation"("artifactId", "policyDigest");
