BEGIN;
ALTER TABLE "GitHubLoginTransaction" ADD COLUMN "linkingOrganizationId" TEXT, ADD COLUMN "linkingOwnerId" TEXT, ADD COLUMN "linkingSessionHash" TEXT;
ALTER TABLE "GitHubOnboardingChallenge" ADD COLUMN "linkingOrganizationId" TEXT, ADD COLUMN "linkingOwnerId" TEXT, ADD COLUMN "linkingSessionHash" TEXT;
COMMIT;
