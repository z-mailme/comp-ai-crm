CREATE TYPE "MailboxMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED_CONTACT', 'MATCHED_COMPANY', 'MATCHED_DEAL', 'IGNORED');

ALTER TABLE "emailThread" ADD COLUMN "matchStatus" "MailboxMatchStatus" NOT NULL DEFAULT 'UNMATCHED';
ALTER TABLE "emailThread" ADD COLUMN "dealId" TEXT;

UPDATE "emailThread"
SET "matchStatus" =
	CASE
		WHEN "contactId" IS NOT NULL THEN 'MATCHED_CONTACT'::"MailboxMatchStatus"
		WHEN "companyId" IS NOT NULL THEN 'MATCHED_COMPANY'::"MailboxMatchStatus"
		ELSE 'UNMATCHED'::"MailboxMatchStatus"
	END;

CREATE INDEX "emailThread_matchStatus_lastMessageAt_idx" ON "emailThread"("matchStatus", "lastMessageAt");
CREATE INDEX "emailThread_dealId_lastMessageAt_idx" ON "emailThread"("dealId", "lastMessageAt");

ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
