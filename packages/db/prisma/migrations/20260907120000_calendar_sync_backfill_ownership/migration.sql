ALTER TABLE "mailboxSync" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "mailboxSync" ADD COLUMN "initialBackfilledAt" TIMESTAMP(3);
ALTER TABLE "mailboxSync" ADD COLUMN "backfillPageToken" TEXT;
ALTER TABLE "mailboxSync" ADD COLUMN "backfillStartedAt" TIMESTAMP(3);
ALTER TABLE "mailboxSync" ADD COLUMN "backfillWindowStart" TIMESTAMP(3);
ALTER TABLE "mailboxSync" ADD COLUMN "backfillWindowEnd" TIMESTAMP(3);

UPDATE "mailboxSync"
SET "businessUnitId" = units.id
FROM (
  SELECT id
  FROM "businessUnit"
  WHERE status = 'ACTIVE'
) units
WHERE "mailboxSync"."source" = 'calendar'
  AND "mailboxSync"."businessUnitId" IS NULL
  AND (SELECT COUNT(*) FROM "businessUnit" WHERE status = 'ACTIVE') = 1;

CREATE INDEX "mailboxSync_businessUnitId_source_idx" ON "mailboxSync"("businessUnitId", "source");
CREATE INDEX "mailboxSync_source_initialBackfilledAt_idx" ON "mailboxSync"("source", "initialBackfilledAt");

ALTER TABLE "mailboxSync" ADD CONSTRAINT "mailboxSync_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
