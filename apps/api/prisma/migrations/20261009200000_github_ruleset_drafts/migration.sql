CREATE TABLE "GitHubRulesetDraft" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "definition" JSONB NOT NULL,
  "definitionHash" TEXT NOT NULL,
  "selectionId" TEXT,
  "packs" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "draftedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GitHubRulesetDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GitHubRulesetDraft_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GitHubRulesetDraft_organizationId_repositoryId_updatedAt_idx" ON "GitHubRulesetDraft"("organizationId", "repositoryId", "updatedAt");
