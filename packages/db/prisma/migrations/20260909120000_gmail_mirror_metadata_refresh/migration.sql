ALTER TABLE "mailboxHistoricalImportJob" ADD COLUMN "refreshedMessages" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "mailboxHistoricalImportChunk" ADD COLUMN "messagesRefreshed" INTEGER NOT NULL DEFAULT 0;
