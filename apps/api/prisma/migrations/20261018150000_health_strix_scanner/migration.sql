CREATE TABLE "RepositoryHealthStrixRun" (
  "assessmentId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerRevision" INTEGER NOT NULL,
  "routeId" TEXT NOT NULL,
  "routeRevision" INTEGER NOT NULL,
  "endpointDigest" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "modelCalls" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "inFlight" INTEGER NOT NULL DEFAULT 0,
  "dispatchedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryHealthStrixRun_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "RepositoryHealthStrixRun_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RepositoryHealthAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
