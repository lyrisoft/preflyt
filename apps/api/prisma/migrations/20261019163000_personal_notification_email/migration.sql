ALTER TABLE "NotificationPreference"
  ADD COLUMN "notificationEmail" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "pendingEmail" TEXT,
  ADD COLUMN "emailVerificationHash" TEXT,
  ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationWindowAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationSendCount" INTEGER NOT NULL DEFAULT 0;
