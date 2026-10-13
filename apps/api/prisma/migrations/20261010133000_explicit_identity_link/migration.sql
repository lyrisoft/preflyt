ALTER TABLE "GitHubLoginTransaction" ADD COLUMN "linkingIdentity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GitHubOnboardingChallenge" ADD COLUMN "linkingIdentity" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "IdentityLoginLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceIdentityId" TEXT NOT NULL UNIQUE REFERENCES "Identity"("id") ON DELETE RESTRICT,
  "targetIdentityId" TEXT NOT NULL UNIQUE REFERENCES "Identity"("id") ON DELETE RESTRICT,
  "githubUserId" BIGINT NOT NULL CHECK ("githubUserId" > 0),
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("sourceIdentityId" <> "targetIdentityId")
);
