-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginTransaction" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "browserBinding" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BootstrapState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BootstrapChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_issuer_subject_key" ON "Identity"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_identityId_key" ON "Membership"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "LoginTransaction_stateHash_key" ON "LoginTransaction"("stateHash");

-- CreateIndex
CREATE INDEX "LoginTransaction_expiresAt_idx" ON "LoginTransaction"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebSession_tokenHash_key" ON "WebSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WebSession_identityId_expiresAt_idx" ON "WebSession"("identityId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_event_createdAt_idx" ON "AuditEvent"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BootstrapChallenge_tokenHash_key" ON "BootstrapChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "BootstrapChallenge_expiresAt_idx" ON "BootstrapChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthThrottle_action_keyHash_windowStart_key" ON "AuthThrottle"("action", "keyHash", "windowStart");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BootstrapChallenge" ADD CONSTRAINT "BootstrapChallenge_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
