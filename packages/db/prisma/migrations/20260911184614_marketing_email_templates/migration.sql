-- CreateTable
CREATE TABLE "marketingEmailTemplate" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "previewText" TEXT,
    "blocks" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketingEmailTemplate_businessUnitId_status_idx" ON "marketingEmailTemplate"("businessUnitId", "status");

-- AddForeignKey
ALTER TABLE "marketingEmailTemplate" ADD CONSTRAINT "marketingEmailTemplate_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEmailTemplate" ADD CONSTRAINT "marketingEmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
