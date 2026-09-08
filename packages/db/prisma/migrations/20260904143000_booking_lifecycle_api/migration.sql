ALTER TABLE "booking" ADD COLUMN "bookingKey" TEXT;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY "dealId" ORDER BY "createdAt", id) AS position
    FROM "booking"
)
UPDATE "booking"
SET "bookingKey" = CASE
    WHEN ranked.position = 1 THEN 'primary'
    ELSE 'booking-' || ranked.position::text
END
FROM ranked
WHERE "booking".id = ranked.id;

ALTER TABLE "booking" ALTER COLUMN "bookingKey" SET NOT NULL;
ALTER TABLE "booking" ALTER COLUMN "bookingKey" SET DEFAULT 'primary';

CREATE UNIQUE INDEX "booking_dealId_bookingKey_key" ON "booking"("dealId", "bookingKey");
