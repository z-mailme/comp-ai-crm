-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('META_FACEBOOK', 'META_INSTAGRAM', 'LINKEDIN', 'TIKTOK', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_ATTENTION', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SocialPostTargetStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialInteractionKind" AS ENUM ('COMMENT', 'MENTION', 'MESSAGE');

-- CreateEnum
CREATE TYPE "SocialInteractionStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "socialAccount" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "credentials" JSONB,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socialPost" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "campaignId" TEXT,
    "contentId" TEXT,
    "caption" TEXT NOT NULL,
    "mediaUrls" JSONB NOT NULL DEFAULT '[]',
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "providerPostId" TEXT,
    "providerResponse" JSONB,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socialPostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "SocialPostTargetStatus" NOT NULL DEFAULT 'PENDING',
    "providerPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socialPostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socialInteraction" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "SocialInteractionKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "authorName" TEXT,
    "text" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "SocialInteractionStatus" NOT NULL DEFAULT 'UNREAD',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socialInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "socialAccount_businessUnitId_status_idx" ON "socialAccount"("businessUnitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "socialAccount_businessUnitId_provider_externalAccountId_key" ON "socialAccount"("businessUnitId", "provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "socialPost_idempotencyKey_key" ON "socialPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "socialPost_businessUnitId_status_scheduledAt_idx" ON "socialPost"("businessUnitId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "socialPostTarget_accountId_status_idx" ON "socialPostTarget"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "socialPostTarget_postId_accountId_key" ON "socialPostTarget"("postId", "accountId");

-- CreateIndex
CREATE INDEX "socialInteraction_businessUnitId_status_occurredAt_idx" ON "socialInteraction"("businessUnitId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "socialInteraction_accountId_kind_externalId_key" ON "socialInteraction"("accountId", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "socialAccount" ADD CONSTRAINT "socialAccount_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialAccount" ADD CONSTRAINT "socialAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPost" ADD CONSTRAINT "socialPost_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPost" ADD CONSTRAINT "socialPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPost" ADD CONSTRAINT "socialPost_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "marketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPost" ADD CONSTRAINT "socialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPost" ADD CONSTRAINT "socialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPostTarget" ADD CONSTRAINT "socialPostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "socialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialPostTarget" ADD CONSTRAINT "socialPostTarget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "socialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialInteraction" ADD CONSTRAINT "socialInteraction_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socialInteraction" ADD CONSTRAINT "socialInteraction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "socialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
