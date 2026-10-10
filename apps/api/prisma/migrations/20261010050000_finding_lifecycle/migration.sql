CREATE TABLE "FindingDisposition" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL,
  "repositoryGithubId" TEXT NOT NULL, "assessmentId" TEXT NOT NULL, "sourceSha" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'REPORTED', "assigneeId" TEXT, "note" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1, "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingDisposition_state_check" CHECK ("state" IN ('REPORTED','IN_REVIEW','RESOLVED')),
  CONSTRAINT "FindingDisposition_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX "FindingDisposition_organizationId_repositoryGithubId_state_idx" ON "FindingDisposition"("organizationId","repositoryGithubId","state");
CREATE UNIQUE INDEX "PreflytTeam_organization_baseline_unique" ON "PreflytTeam"("organizationId") WHERE "source" = 'ORGANIZATION';

ALTER TABLE "TeamPolicyAssignment" ADD COLUMN "supersededAt" TIMESTAMP(3);
