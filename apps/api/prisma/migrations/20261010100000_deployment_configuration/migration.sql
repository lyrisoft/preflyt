CREATE TABLE "DeploymentConfiguration" (
  "id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "values" JSONB NOT NULL,
  "encryptedSecrets" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeploymentConfiguration_pkey" PRIMARY KEY ("id")
);
