ALTER TABLE "LoginTransaction" ADD COLUMN "returnPath" TEXT NOT NULL DEFAULT '/overview';
ALTER TABLE "BootstrapChallenge" ADD COLUMN "returnPath" TEXT NOT NULL DEFAULT '/overview';
