CREATE TABLE "FindingIndexSnapshot" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "scopeKey" TEXT NOT NULL,
 "metadata" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FindingIndexSnapshot_organizationId_scopeKey_createdAt_idx" ON "FindingIndexSnapshot"("organizationId","scopeKey","createdAt");
CREATE TABLE "FindingIndexRow" (
 "snapshotId" TEXT NOT NULL REFERENCES "FindingIndexSnapshot"("id") ON DELETE CASCADE,
 "id" TEXT NOT NULL, "ordinal" INTEGER NOT NULL, "repositoryId" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL, "origin" TEXT NOT NULL, "category" TEXT NOT NULL,
 "categories" TEXT[] NOT NULL, "severity" TEXT NOT NULL, "status" TEXT NOT NULL,
 "ruleId" TEXT, "checkTitle" TEXT, "pullRequest" INTEGER, "ignoreId" TEXT NOT NULL,
 "searchText" TEXT NOT NULL, "data" JSONB NOT NULL,
 PRIMARY KEY ("snapshotId","id")
);
CREATE INDEX "FindingIndexRow_snapshotId_ordinal_idx" ON "FindingIndexRow"("snapshotId","ordinal");
CREATE INDEX "FindingIndexRow_snapshotId_severity_category_idx" ON "FindingIndexRow"("snapshotId","severity","category");
CREATE TABLE "FindingIndexSummary" (
 "snapshotId" TEXT NOT NULL REFERENCES "FindingIndexSnapshot"("id") ON DELETE CASCADE,
 "filterKey" TEXT NOT NULL, "data" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("snapshotId","filterKey")
);
