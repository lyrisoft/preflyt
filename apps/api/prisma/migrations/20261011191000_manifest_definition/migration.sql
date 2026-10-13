ALTER TABLE "GitHubAppManifestTransaction" ADD COLUMN "organization" TEXT NOT NULL DEFAULT '', ADD COLUMN "manifest" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "GitHubAppManifestTransaction" ALTER COLUMN "organization" DROP DEFAULT, ALTER COLUMN "manifest" DROP DEFAULT;
