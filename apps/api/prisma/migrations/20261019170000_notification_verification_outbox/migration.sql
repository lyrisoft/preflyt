CREATE TABLE "NotificationEmailVerificationDelivery" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "encryptedCode" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEmailVerificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationVerification_preference_fkey" FOREIGN KEY ("identityId", "organizationId") REFERENCES "NotificationPreference"("identityId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NotificationVerification_pending_idx" ON "NotificationEmailVerificationDelivery"("state", "nextAttemptAt", "leaseUntil");
CREATE INDEX "NotificationVerification_owner_token_idx" ON "NotificationEmailVerificationDelivery"("identityId", "organizationId", "tokenHash");
