-- CreateEnum
CREATE TYPE "MarketingContentStatus" AS ENUM ('IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingContentType" AS ENUM ('SOCIAL_POST', 'REEL', 'STORY', 'STATIC_IMAGE', 'CAROUSEL', 'EMAIL', 'AD_COPY', 'BLOG', 'LANDING_COPY', 'PROMOTION', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "marketingContent" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "type" "MarketingContentType" NOT NULL DEFAULT 'SOCIAL_POST',
    "status" "MarketingContentStatus" NOT NULL DEFAULT 'DRAFT',
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "caption" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "link" TEXT,
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "listmonkCampaignId" INTEGER,
    "ownerId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingMediaAsset" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "campaignId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "sha256" TEXT,
    "blobUrl" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "uploadedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingContentMedia" (
    "contentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "marketingContentMedia_pkey" PRIMARY KEY ("contentId","assetId")
);

-- CreateIndex
CREATE INDEX "marketingContent_businessUnitId_status_idx" ON "marketingContent"("businessUnitId", "status");

-- CreateIndex
CREATE INDEX "marketingContent_businessUnitId_scheduledAt_idx" ON "marketingContent"("businessUnitId", "scheduledAt");

-- CreateIndex
CREATE INDEX "marketingContent_campaignId_idx" ON "marketingContent"("campaignId");

-- CreateIndex
CREATE INDEX "marketingMediaAsset_businessUnitId_sha256_idx" ON "marketingMediaAsset"("businessUnitId", "sha256");

-- CreateIndex
CREATE INDEX "marketingMediaAsset_businessUnitId_archivedAt_idx" ON "marketingMediaAsset"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "marketingContentMedia_assetId_idx" ON "marketingContentMedia"("assetId");

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingMediaAsset" ADD CONSTRAINT "marketingMediaAsset_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingMediaAsset" ADD CONSTRAINT "marketingMediaAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingMediaAsset" ADD CONSTRAINT "marketingMediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContentMedia" ADD CONSTRAINT "marketingContentMedia_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContentMedia" ADD CONSTRAINT "marketingContentMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "marketingMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
