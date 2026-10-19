CREATE TABLE "AiVaptSettings" (
  "organizationId" TEXT NOT NULL,
  "maxInputTokens" INTEGER NOT NULL DEFAULT 4000000,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 131072,
  "maxModelCalls" INTEGER NOT NULL DEFAULT 80,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiVaptSettings_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "AiVaptSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiVaptSettings_input_bounds" CHECK ("maxInputTokens" BETWEEN 100000 AND 100000000),
  CONSTRAINT "AiVaptSettings_output_bounds" CHECK ("maxOutputTokens" BETWEEN 8192 AND 2000000),
  CONSTRAINT "AiVaptSettings_calls_bounds" CHECK ("maxModelCalls" BETWEEN 1 AND 1000)
);

ALTER TABLE "RepositoryHealthStrixRun"
  ADD COLUMN "maxInputTokens" INTEGER NOT NULL DEFAULT 4000000,
  ADD COLUMN "maxOutputTokens" INTEGER NOT NULL DEFAULT 131072,
  ADD COLUMN "maxModelCalls" INTEGER NOT NULL DEFAULT 80;
