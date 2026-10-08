CREATE TABLE "SuperAdminCredential" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperAdminCredential_username_key" ON "SuperAdminCredential"("username");
CREATE UNIQUE INDEX "SuperAdminCredential_identityId_key" ON "SuperAdminCredential"("identityId");

ALTER TABLE "SuperAdminCredential"
ADD CONSTRAINT "SuperAdminCredential_identityId_fkey"
FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
