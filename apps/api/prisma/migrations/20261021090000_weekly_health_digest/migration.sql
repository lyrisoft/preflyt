ALTER TABLE "NotificationPreference"
  ADD COLUMN "weeklyHealthEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weeklyHealthRepositoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "weeklyHealthDay" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "weeklyHealthHour" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "weeklyHealthTimezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "weeklyHealthEnabledAt" TIMESTAMP(3);
CREATE TABLE "WeeklyHealthDigestDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identityId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "week" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "cutoff" TIMESTAMP(3) NOT NULL,
  "repositoryIds" TEXT[] NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyHealthDigestDelivery_preference_fkey" FOREIGN KEY ("identityId", "organizationId") REFERENCES "NotificationPreference"("identityId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WeeklyHealthDigestDelivery_identityId_organizationId_week_key" ON "WeeklyHealthDigestDelivery"("identityId", "organizationId", "week");
CREATE INDEX "WeeklyHealthDigestDelivery_state_nextAttemptAt_leaseUntil_idx" ON "WeeklyHealthDigestDelivery"("state", "nextAttemptAt", "leaseUntil");
