-- AlterTable
ALTER TABLE "marketingContent" ADD COLUMN     "externalKey" TEXT,
ADD COLUMN     "selectedDriveAssetId" TEXT,
ADD COLUMN     "service" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marketingContent_businessUnitId_externalKey_key" ON "marketingContent"("businessUnitId", "externalKey");

-- AddForeignKey
ALTER TABLE "marketingContent" ADD CONSTRAINT "marketingContent_selectedDriveAssetId_fkey" FOREIGN KEY ("selectedDriveAssetId") REFERENCES "driveMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
