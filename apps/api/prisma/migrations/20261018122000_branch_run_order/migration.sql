ALTER TABLE "RepositoryBranchRun" ADD COLUMN "runCreatedAt" TIMESTAMP(3);
UPDATE "RepositoryBranchRun" SET "runCreatedAt" = "createdAt";
ALTER TABLE "RepositoryBranchRun" ALTER COLUMN "runCreatedAt" SET NOT NULL;
DROP INDEX "RepositoryBranchRun_repositoryId_branch_createdAt_idx";
CREATE INDEX "RepositoryBranchRun_branch_order_idx"
ON "RepositoryBranchRun"("repositoryId", "branch", "runCreatedAt", "runAttempt");
