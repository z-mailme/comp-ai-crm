-- CreateTable
CREATE TABLE "marketingAdsSnapshot" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "provider" "MarketingProvider" NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'campaigns',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingAdsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketingAdsSnapshot_businessUnitId_provider_kind_key" ON "marketingAdsSnapshot"("businessUnitId", "provider", "kind");

-- AddForeignKey
ALTER TABLE "marketingAdsSnapshot" ADD CONSTRAINT "marketingAdsSnapshot_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
