ALTER TABLE "GitHubWebhookDelivery" ADD COLUMN "sourceIdentity" JSONB;
ALTER TABLE "ImportedCiEvidence" ADD COLUMN "sourceIdentity" JSONB;
CREATE TABLE "RepositoryCiBindings" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "selectionId" TEXT NOT NULL, "bindings" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RepositoryCiBindings_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryCiBindings_repositoryId_revision_key" ON "RepositoryCiBindings"("repositoryId","revision");
