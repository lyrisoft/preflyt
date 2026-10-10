-- Add organization destinations without changing existing personal delivery records.
CREATE TABLE "OrganizationNotificationChannel" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'EMAIL',
  "name" TEXT NOT NULL,
  "recipients" TEXT[] NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationNotificationChannel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotificationChannelDelivery" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "eventId" TEXT,
  "organizationId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "requestedById" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'EVENT',
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationChannelDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationNotificationChannel_organizationId_deletedAt_cr_idx" ON "OrganizationNotificationChannel"("organizationId", "deletedAt", "createdAt");
CREATE UNIQUE INDEX "NotificationChannelDelivery_channelId_eventId_recipient_key" ON "NotificationChannelDelivery"("channelId", "eventId", "recipient");
CREATE INDEX "NotificationChannelDelivery_channelId_createdAt_idx" ON "NotificationChannelDelivery"("channelId", "createdAt");
CREATE INDEX "NotificationChannelDelivery_state_nextAttemptAt_leaseUntil_idx" ON "NotificationChannelDelivery"("state", "nextAttemptAt", "leaseUntil");
ALTER TABLE "OrganizationNotificationChannel" ADD CONSTRAINT "OrganizationNotificationChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationChannelDelivery" ADD CONSTRAINT "NotificationChannelDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "OrganizationNotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationChannelDelivery" ADD CONSTRAINT "NotificationChannelDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
