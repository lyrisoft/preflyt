CREATE TABLE "NotificationEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "assessmentId" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL, "repositoryId" TEXT NOT NULL,
 "repositoryGithubId" TEXT NOT NULL, "repositoryName" TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL, "actorId" TEXT, "type" TEXT NOT NULL,
 "severity" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveredAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "failedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "NotificationEvent_assessmentId_key" ON "NotificationEvent"("assessmentId");
CREATE INDEX "NotificationEvent_deliveredAt_failedAt_createdAt_idx" ON "NotificationEvent"("deliveredAt", "failedAt", "createdAt");
CREATE TABLE "InboxNotification" (
 "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "identityId" TEXT NOT NULL,
 "readAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InboxNotification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InboxNotification_eventId_identityId_key" ON "InboxNotification"("eventId", "identityId");
CREATE INDEX "InboxNotification_identityId_readAt_deliveredAt_idx" ON "InboxNotification"("identityId", "readAt", "deliveredAt");
CREATE TABLE "NotificationPreference" (
 "identityId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "assessments" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("identityId", "organizationId")
);
