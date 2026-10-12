CREATE TABLE "AiFindingGuidance" (
 "id" TEXT PRIMARY KEY,
 "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "origin" TEXT NOT NULL, "assessmentId" TEXT NOT NULL, "findingId" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'QUEUED', "result" JSONB, "resultHash" TEXT, "failure" TEXT,
 "modelLabel" TEXT, "usage" JSONB, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "AiFindingGuidance_organizationId_repositoryId_assessmentId_findingId_idx" ON "AiFindingGuidance"("organizationId", "repositoryId", "assessmentId", "findingId");
CREATE INDEX "AiFindingGuidance_state_leaseUntil_createdAt_idx" ON "AiFindingGuidance"("state", "leaseUntil", "createdAt");
CREATE INDEX "AiFindingGuidance_organizationId_createdAt_idx" ON "AiFindingGuidance"("organizationId", "createdAt");
