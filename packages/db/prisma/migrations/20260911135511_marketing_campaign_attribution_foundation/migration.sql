-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "consentDate" TIMESTAMP(3),
ADD COLUMN     "emailMarketingAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentSource" TEXT,
ADD COLUMN     "unsubscribeDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trackedVisitor" ADD COLUMN     "firstFbclid" TEXT,
ADD COLUMN     "firstGbraid" TEXT,
ADD COLUMN     "firstGclid" TEXT,
ADD COLUMN     "firstWbraid" TEXT,
ADD COLUMN     "lastFbclid" TEXT,
ADD COLUMN     "lastGbraid" TEXT,
ADD COLUMN     "lastGclid" TEXT,
ADD COLUMN     "lastWbraid" TEXT;

-- CreateTable
CREATE TABLE "marketingCampaign" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "targetAudience" TEXT,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketingCampaign_businessUnitId_status_idx" ON "marketingCampaign"("businessUnitId", "status");

-- CreateIndex
CREATE INDEX "marketingCampaign_businessUnitId_utmCampaign_idx" ON "marketingCampaign"("businessUnitId", "utmCampaign");

-- AddForeignKey
ALTER TABLE "marketingCampaign" ADD CONSTRAINT "marketingCampaign_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaign" ADD CONSTRAINT "marketingCampaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaign" ADD CONSTRAINT "marketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
