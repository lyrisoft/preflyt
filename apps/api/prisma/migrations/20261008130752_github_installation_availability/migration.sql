-- AlterTable
ALTER TABLE "GitHubInstallation" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);
