ALTER TABLE "NotificationEvent" ALTER COLUMN "assessmentId" DROP NOT NULL;
ALTER TABLE "NotificationEvent" ALTER COLUMN "sourceSha" DROP NOT NULL;
ALTER TABLE "NotificationEvent" ADD COLUMN "policyId" TEXT, ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "NotificationEvent_policyId_key" ON "NotificationEvent"("policyId");
ALTER TABLE "NotificationPreference" ADD COLUMN "email" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "NotificationEmailDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "inboxId" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3),
 "sentAt" TIMESTAMP(3), "failureCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "NotificationEmailDelivery_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "InboxNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationEmailDelivery_inboxId_key" ON "NotificationEmailDelivery"("inboxId");
CREATE INDEX "NotificationEmailDelivery_state_nextAttemptAt_leaseUntil_idx" ON "NotificationEmailDelivery"("state", "nextAttemptAt", "leaseUntil");
