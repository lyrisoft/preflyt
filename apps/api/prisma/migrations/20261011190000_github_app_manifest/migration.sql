CREATE TABLE "GitHubAppManifestTransaction" (
 "id" TEXT NOT NULL, "stateHash" TEXT NOT NULL, "bindingHash" TEXT NOT NULL,
 "sessionHash" TEXT NOT NULL, "actorId" TEXT NOT NULL, "configurationRevision" INTEGER NOT NULL,
 "apiUrl" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "appSlug" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GitHubAppManifestTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GitHubAppManifestTransaction_stateHash_key" ON "GitHubAppManifestTransaction"("stateHash");
CREATE INDEX "GitHubAppManifestTransaction_actorId_sessionHash_createdAt_idx" ON "GitHubAppManifestTransaction"("actorId", "sessionHash", "createdAt");
CREATE INDEX "GitHubAppManifestTransaction_expiresAt_idx" ON "GitHubAppManifestTransaction"("expiresAt");
