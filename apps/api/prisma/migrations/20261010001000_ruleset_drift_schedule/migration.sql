ALTER TABLE "GitHubRulesetDeployment" ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3);
CREATE INDEX "GitHubRulesetDeployment_lastSyncAttemptAt_idx" ON "GitHubRulesetDeployment"("lastSyncAttemptAt");
