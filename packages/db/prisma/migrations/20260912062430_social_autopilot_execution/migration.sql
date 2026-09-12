-- CreateEnum
CREATE TYPE "MarketingAutomationMode" AS ENUM ('MANUAL', 'APPROVAL_REQUIRED', 'FULL_AUTO');

-- CreateEnum
CREATE TYPE "DriveAssetApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriveMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "CanvaRenderStatus" AS ENUM ('QUEUED', 'RENDERING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishErrorCategory" AS ENUM ('PERMISSION', 'RATE_LIMIT', 'MEDIA_REJECTED', 'NETWORK', 'PROVIDER', 'VALIDATION', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseStatus" ADD VALUE 'PROJECTED';
ALTER TYPE "ExpenseStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ExpenseStatus" ADD VALUE 'PAID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarketingContentStatus" ADD VALUE 'PLANNED';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'MEDIA_SELECTED';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'COPY_GENERATED';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'DESIGN_GENERATED';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'PUBLISHING';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'FAILED';
ALTER TYPE "MarketingContentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "marketingContent" ADD COLUMN     "automationMode" "MarketingAutomationMode";

-- CreateTable
CREATE TABLE "driveMediaAsset" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "mediaKind" "DriveMediaKind" NOT NULL DEFAULT 'OTHER',
    "service" TEXT,
    "folderName" TEXT,
    "approvalState" "DriveAssetApprovalState" NOT NULL DEFAULT 'PENDING',
    "lastUsedAt" TIMESTAMP(3),
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "doNotUseUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driveMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driveAssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "contentId" TEXT,
    "socialPostId" TEXT,
    "context" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driveAssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvaRender" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "service" TEXT,
    "format" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceAssetId" TEXT,
    "headline" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "renderedUrl" TEXT,
    "designId" TEXT,
    "status" "CanvaRenderStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvaRender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socialPublishAttempt" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "contentId" TEXT,
    "socialPostId" TEXT,
    "platform" TEXT NOT NULL,
    "accountId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "providerRequestId" TEXT,
    "externalPostId" TEXT,
    "externalPostUrl" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCategory" "PublishErrorCategory",
    "errorSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socialPublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingContentMetric" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingContentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingAutomationAudit" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "contentId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingAutomationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driveMediaAsset_businessUnitId_approvalState_service_idx" ON "driveMediaAsset"("businessUnitId", "approvalState", "service");

-- CreateIndex
CREATE UNIQUE INDEX "driveMediaAsset_businessUnitId_driveFileId_key" ON "driveMediaAsset"("businessUnitId", "driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "driveAssetUsage_idempotencyKey_key" ON "driveAssetUsage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "driveAssetUsage_assetId_usedAt_idx" ON "driveAssetUsage"("assetId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "canvaRender_idempotencyKey_key" ON "canvaRender"("idempotencyKey");

-- CreateIndex
CREATE INDEX "canvaRender_contentId_createdAt_idx" ON "canvaRender"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "canvaRender_businessUnitId_status_idx" ON "canvaRender"("businessUnitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "socialPublishAttempt_idempotencyKey_key" ON "socialPublishAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "socialPublishAttempt_businessUnitId_platform_createdAt_idx" ON "socialPublishAttempt"("businessUnitId", "platform", "createdAt");

-- CreateIndex
CREATE INDEX "socialPublishAttempt_contentId_createdAt_idx" ON "socialPublishAttempt"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "marketingContentMetric_businessUnitId_date_idx" ON "marketingContentMetric"("businessUnitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "marketingContentMetric_contentId_platform_date_key" ON "marketingContentMetric"("contentId", "platform", "date");

-- CreateIndex
CREATE INDEX "marketingAutomationAudit_businessUnitId_createdAt_idx" ON "marketingAutomationAudit"("businessUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "marketingAutomationAudit_contentId_createdAt_idx" ON "marketingAutomationAudit"("contentId", "createdAt");

-- AddForeignKey
ALTER TABLE "driveMediaAsset" ADD CONSTRAINT "driveMediaAsset_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driveAssetUsage" ADD CONSTRAINT "driveAssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "driveMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driveAssetUsage" ADD CONSTRAINT "driveAssetUsage_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driveAssetUsage" ADD CONSTRAINT "driveAssetUsage_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "socialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvaRender" ADD CONSTRAINT "canvaRender_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvaRender" ADD CONSTRAINT "canvaRender_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvaRender" ADD CONSTRAINT "canvaRender_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "driveMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPublishAttempt" ADD CONSTRAINT "socialPublishAttempt_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPublishAttempt" ADD CONSTRAINT "socialPublishAttempt_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPublishAttempt" ADD CONSTRAINT "socialPublishAttempt_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "socialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContentMetric" ADD CONSTRAINT "marketingContentMetric_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingContentMetric" ADD CONSTRAINT "marketingContentMetric_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingAutomationAudit" ADD CONSTRAINT "marketingAutomationAudit_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingAutomationAudit" ADD CONSTRAINT "marketingAutomationAudit_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingAutomationAudit" ADD CONSTRAINT "marketingAutomationAudit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
