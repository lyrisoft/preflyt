CREATE TABLE "ReadinessAutomation" (
 "repositoryId" TEXT PRIMARY KEY REFERENCES "GitHubRepository"("id") ON DELETE CASCADE,
 "organizationId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ReadinessTask" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE,
 "prNumber" INTEGER NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "state" TEXT NOT NULL DEFAULT 'PENDING',
 "sourceSha" TEXT, "branchRef" TEXT, "assessmentId" TEXT, "policyId" TEXT, "policyHash" TEXT, "evaluationHash" TEXT,
 "externalId" TEXT, "checkRunId" TEXT, "appId" TEXT, "htmlUrl" TEXT, "conclusion" TEXT, "verifiedAt" TIMESTAMP(3),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "message" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ReadinessTask_repositoryId_prNumber_key" ON "ReadinessTask"("repositoryId","prNumber");
CREATE INDEX "ReadinessTask_nextAttemptAt_leaseUntil_idx" ON "ReadinessTask"("nextAttemptAt","leaseUntil");
CREATE TABLE "GitHubRulesetDeployment" (
 "id" TEXT PRIMARY KEY, "repositoryId" TEXT NOT NULL REFERENCES "GitHubRepository"("id") ON DELETE CASCADE,
 "organizationId" TEXT NOT NULL, "draftId" TEXT NOT NULL, "draftHash" TEXT NOT NULL,
 "definition" JSONB NOT NULL, "definitionHash" TEXT NOT NULL, "preview" JSONB NOT NULL, "previewHash" TEXT NOT NULL,
 "proposedById" TEXT NOT NULL, "approvedById" TEXT, "approvalKind" TEXT NOT NULL DEFAULT 'INDEPENDENT',
 "state" TEXT NOT NULL DEFAULT 'PREVIEW', "githubRulesetId" TEXT,
 "governanceAppId" TEXT NOT NULL, "governanceInstallationId" TEXT NOT NULL,
 "observedHash" TEXT, "observedDefinition" JSONB, "verifiedAt" TIMESTAMP(3),
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "message" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GitHubRulesetDeployment_repositoryId_organizationId_createdAt_idx" ON "GitHubRulesetDeployment"("repositoryId","organizationId","createdAt");
