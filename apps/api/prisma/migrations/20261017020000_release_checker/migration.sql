CREATE TABLE "ReleaseCheck" (
 "id" TEXT PRIMARY KEY NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "prereleases" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL DEFAULT '[]', "etag" TEXT, "checkedAt" TIMESTAMP(3),
 "retryAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "error" TEXT
);
CREATE TABLE "ReleaseRead" ("identityId" TEXT PRIMARY KEY NOT NULL, "tag" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
