ALTER TABLE "emailMessage" ADD COLUMN "gmailThreadId" TEXT;
ALTER TABLE "emailMessage" ADD COLUMN "labelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "mailboxSync" ADD COLUMN "lastFullReconcileAt" TIMESTAMP(3);

CREATE TABLE "gmailLabel" (
    "id" TEXT NOT NULL,
    "mailboxSyncId" TEXT NOT NULL,
    "gmailLabelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "colorBackground" TEXT,
    "colorText" TEXT,
    "messagesTotal" INTEGER,
    "messagesUnread" INTEGER,
    "threadsTotal" INTEGER,
    "threadsUnread" INTEGER,
    "labelListVisibility" TEXT,
    "messageListVisibility" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gmailLabel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gmailLabel_mailboxSyncId_gmailLabelId_key" ON "gmailLabel"("mailboxSyncId", "gmailLabelId");

ALTER TABLE "gmailLabel" ADD CONSTRAINT "gmailLabel_mailboxSyncId_fkey" FOREIGN KEY ("mailboxSyncId") REFERENCES "mailboxSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
