CREATE TYPE "MailboxHistoricalImportJobStatus" AS ENUM ('PLANNING', 'READY', 'RUNNING', 'VERIFYING', 'WAITING_RATE_LIMIT', 'WAITING_RETRY', 'RECONNECT_REQUIRED', 'PAUSED', 'FAILED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "MailboxHistoricalImportChunkStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_RATE_LIMIT', 'RETRYABLE_FAILED', 'RECONNECT_REQUIRED', 'FAILED', 'COMPLETED');

CREATE TYPE "MailboxHistoricalImportVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISSING', 'FAILED');

CREATE TABLE "mailboxHistoricalImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'gmail',
    "requestedAfter" TIMESTAMP(3) NOT NULL,
    "requestedBefore" TIMESTAMP(3) NOT NULL,
    "status" "MailboxHistoricalImportJobStatus" NOT NULL DEFAULT 'PLANNING',
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "processedMessages" INTEGER NOT NULL DEFAULT 0,
    "writtenMessages" INTEGER NOT NULL DEFAULT 0,
    "alreadyStoredMessages" INTEGER NOT NULL DEFAULT 0,
    "ignoredMessages" INTEGER NOT NULL DEFAULT 0,
    "remainingMessages" INTEGER NOT NULL DEFAULT 0,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "currentChunkId" TEXT,
    "retryAfterAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mailboxHistoricalImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mailboxHistoricalImportChunk" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "after" TIMESTAMP(3) NOT NULL,
    "before" TIMESTAMP(3) NOT NULL,
    "sortIndex" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "status" "MailboxHistoricalImportChunkStatus" NOT NULL DEFAULT 'PENDING',
    "messagesMatched" INTEGER,
    "messagesAlreadyStored" INTEGER NOT NULL DEFAULT 0,
    "messagesAttempted" INTEGER NOT NULL DEFAULT 0,
    "messagesWritten" INTEGER NOT NULL DEFAULT 0,
    "messagesIgnored" INTEGER NOT NULL DEFAULT 0,
    "messagesRemaining" INTEGER NOT NULL DEFAULT 0,
    "ignoredMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "retryAfterAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "failedMessageId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationStatus" "MailboxHistoricalImportVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mailboxHistoricalImportChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mailboxHistoricalImportChunk_jobId_after_before_key" ON "mailboxHistoricalImportChunk"("jobId", "after", "before");

CREATE INDEX "mailboxHistoricalImportJob_userId_status_idx" ON "mailboxHistoricalImportJob"("userId", "status");

CREATE INDEX "mailboxHistoricalImportJob_status_retryAfterAt_idx" ON "mailboxHistoricalImportJob"("status", "retryAfterAt");

CREATE INDEX "mailboxHistoricalImportJob_status_leaseExpiresAt_idx" ON "mailboxHistoricalImportJob"("status", "leaseExpiresAt");

CREATE INDEX "mailboxHistoricalImportJob_userId_source_requestedAfter_requestedBefore_idx" ON "mailboxHistoricalImportJob"("userId", "source", "requestedAfter", "requestedBefore");

CREATE INDEX "mailboxHistoricalImportChunk_jobId_sortIndex_idx" ON "mailboxHistoricalImportChunk"("jobId", "sortIndex");

CREATE INDEX "mailboxHistoricalImportChunk_jobId_status_idx" ON "mailboxHistoricalImportChunk"("jobId", "status");

CREATE INDEX "mailboxHistoricalImportChunk_status_retryAfterAt_idx" ON "mailboxHistoricalImportChunk"("status", "retryAfterAt");

ALTER TABLE "mailboxHistoricalImportJob" ADD CONSTRAINT "mailboxHistoricalImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mailboxHistoricalImportChunk" ADD CONSTRAINT "mailboxHistoricalImportChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "mailboxHistoricalImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
