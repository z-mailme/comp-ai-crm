CREATE TYPE "MarketingProvider" AS ENUM ('LISTMONK', 'GOOGLE_ADS', 'META_ADS');

CREATE TYPE "MarketingIntegrationStatus" AS ENUM ('CONNECTED', 'NOT_CONFIGURED', 'NEEDS_ATTENTION');

ALTER TABLE "calendarEvent" ADD COLUMN "businessUnitId" TEXT;

CREATE TABLE "marketingIntegration" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "provider" "MarketingProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "MarketingIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB,
    "secrets" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingAudience" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rules" JSONB NOT NULL,
    "provider" "MarketingProvider",
    "providerListId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingCreativeAsset" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "provider" "MarketingProvider" NOT NULL,
    "externalCreativeId" TEXT,
    "canvaDesignId" TEXT,
    "exportedAssetUrl" TEXT,
    "creativeVersion" TEXT,
    "channel" TEXT,
    "format" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingCreativeAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketingIntegration_businessUnitId_provider_key" ON "marketingIntegration"("businessUnitId", "provider");
CREATE INDEX "marketingIntegration_provider_status_idx" ON "marketingIntegration"("provider", "status");
CREATE INDEX "marketingAudience_businessUnitId_status_idx" ON "marketingAudience"("businessUnitId", "status");
CREATE INDEX "marketingCreativeAsset_businessUnitId_provider_idx" ON "marketingCreativeAsset"("businessUnitId", "provider");
CREATE INDEX "calendarEvent_businessUnitId_startsAt_idx" ON "calendarEvent"("businessUnitId", "startsAt");

ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingIntegration" ADD CONSTRAINT "marketingIntegration_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketingIntegration" ADD CONSTRAINT "marketingIntegration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingAudience" ADD CONSTRAINT "marketingAudience_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketingAudience" ADD CONSTRAINT "marketingAudience_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingCreativeAsset" ADD CONSTRAINT "marketingCreativeAsset_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
