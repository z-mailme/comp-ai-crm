CREATE TYPE "BookingStatus" AS ENUM ('PROVISIONAL', 'HELD', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "BookingResourceType" AS ENUM ('360_PHOTO_BOOTH');

CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "eventDate" DATE NOT NULL,
    "requestedStartAt" TIMESTAMP(3),
    "requestedEndAt" TIMESTAMP(3),
    "confirmedStartAt" TIMESTAMP(3),
    "confirmedEndAt" TIMESTAMP(3),
    "operationalStartAt" TIMESTAMP(3),
    "operationalEndAt" TIMESTAMP(3),
    "googleCalendarEventId" TEXT,
    "calendarStatus" "CalendarStatus" NOT NULL DEFAULT 'NOT_ADDED',
    "calendarSyncedAt" TIMESTAMP(3),
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookingResource" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "resourceType" "BookingResourceType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookingResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookingResourceCapacity" (
    "resourceType" "BookingResourceType" NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookingResourceCapacity_pkey" PRIMARY KEY ("resourceType")
);

ALTER TABLE "emailThread" ADD COLUMN "bookingId" TEXT;

CREATE UNIQUE INDEX "bookingResource_bookingId_resourceType_key" ON "bookingResource"("bookingId", "resourceType");
CREATE INDEX "booking_dealId_idx" ON "booking"("dealId");
CREATE INDEX "booking_status_eventDate_idx" ON "booking"("status", "eventDate");
CREATE INDEX "booking_googleCalendarEventId_idx" ON "booking"("googleCalendarEventId");
CREATE INDEX "bookingResource_resourceType_idx" ON "bookingResource"("resourceType");
CREATE INDEX "emailThread_bookingId_lastMessageAt_idx" ON "emailThread"("bookingId", "lastMessageAt");

ALTER TABLE "booking" ADD CONSTRAINT "booking_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookingResource" ADD CONSTRAINT "bookingResource_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookingResource" ADD CONSTRAINT "bookingResource_quantity_positive_check" CHECK ("quantity" > 0);
ALTER TABLE "bookingResourceCapacity" ADD CONSTRAINT "bookingResourceCapacity_totalUnits_non_negative_check" CHECK ("totalUnits" >= 0);

INSERT INTO "bookingResourceCapacity" ("resourceType", "totalUnits", "updatedAt")
VALUES ('360_PHOTO_BOOTH', 5, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceType") DO UPDATE SET "totalUnits" = EXCLUDED."totalUnits", "updatedAt" = CURRENT_TIMESTAMP;
