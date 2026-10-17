CREATE TABLE "InstallationReporting" (
 "id" TEXT NOT NULL PRIMARY KEY, "installationId" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
 "acknowledgedAt" TIMESTAMP(3), "lastReportedAt" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3),
 "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "failureCount" INTEGER NOT NULL DEFAULT 0,
 "error" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "InstallationReporting_installationId_key" ON "InstallationReporting"("installationId");
