CREATE TYPE "BrainAnalysisJobStatus" AS ENUM ('PLANNING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "brainAnalysisJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'gmail',
    "status" "BrainAnalysisJobStatus" NOT NULL DEFAULT 'PLANNING',
    "cursorLastMessageAt" TIMESTAMP(3),
    "cursorThreadId" TEXT,
    "totalThreads" INTEGER NOT NULL DEFAULT 0,
    "processedThreads" INTEGER NOT NULL DEFAULT 0,
    "knowledgeWritten" INTEGER NOT NULL DEFAULT 0,
    "conflictsFound" INTEGER NOT NULL DEFAULT 0,
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT,
    "providerUsed" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brainAnalysisJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brainAnalysisJob_userId_status_idx" ON "brainAnalysisJob"("userId", "status");
CREATE INDEX "brainAnalysisJob_status_idx" ON "brainAnalysisJob"("status");

ALTER TABLE "brainAnalysisJob" ADD CONSTRAINT "brainAnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
