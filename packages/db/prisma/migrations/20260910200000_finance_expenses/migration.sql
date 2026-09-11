ALTER TYPE "BookingResourceType" ADD VALUE 'OPERATOR';

CREATE TYPE "ExpenseCategory" AS ENUM ('OPERATOR_LABOUR', 'TRAVEL', 'SUPPLIES', 'EQUIPMENT', 'PRINTING', 'OTHER');
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'CALCULATED');
CREATE TYPE "ExpenseStatus" AS ENUM ('RECORDED', 'NEEDS_REVIEW', 'CANCELLED');

CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "bookingId" TEXT,
    "dealId" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'RECORDED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "incurredAt" DATE NOT NULL,
    "note" TEXT,
    "evidence" JSONB,
    "calculationKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_calculationKey_key" ON "expense"("calculationKey");
CREATE INDEX "expense_businessUnitId_incurredAt_idx" ON "expense"("businessUnitId", "incurredAt");
CREATE INDEX "expense_bookingId_idx" ON "expense"("bookingId");
CREATE INDEX "expense_dealId_idx" ON "expense"("dealId");

ALTER TABLE "expense" ADD CONSTRAINT "expense_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense" ADD CONSTRAINT "expense_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense" ADD CONSTRAINT "expense_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense" ADD CONSTRAINT "expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
