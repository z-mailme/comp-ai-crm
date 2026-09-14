ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'FUEL';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'DECOR';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'ADVERTISING';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'SOFTWARE';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'SUBSCRIPTIONS';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'REPAIRS';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'HOSTING_IT';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'BANK_FEES';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'REFUNDS';

ALTER TYPE "FinanceDocumentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "FinanceDocumentStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TYPE "InvoiceLifecycleStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

ALTER TYPE "FinanceAuditAction" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "FinanceAuditAction" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "FinanceAuditAction" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "FinanceAuditAction" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "FinanceAuditAction" ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TABLE "expense" ADD COLUMN "ruleKey" TEXT;
ALTER TABLE "expense" ADD COLUMN "ruleVersion" INTEGER;
ALTER TABLE "expense" ADD COLUMN "expectedAmountCents" INTEGER;
ALTER TABLE "expense" ADD COLUMN "discrepancyCents" INTEGER;
ALTER TABLE "expense" ADD COLUMN "operatorContactId" TEXT;
ALTER TABLE "expense" ADD COLUMN "recurringTemplateKey" TEXT;
ALTER TABLE "expense" ADD COLUMN "receiptReference" TEXT;

ALTER TABLE "financeRule" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "financeRule" ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "financeRule" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "quote" ADD COLUMN "service" TEXT;
ALTER TABLE "quote" ADD COLUMN "eventDate" DATE;
ALTER TABLE "quote" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote" ADD COLUMN "travelFeeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote" ADD COLUMN "depositCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote" ADD COLUMN "terms" TEXT;
ALTER TABLE "quote" ADD COLUMN "documentKey" TEXT;
ALTER TABLE "quote" ADD COLUMN "documentGeneratedAt" TIMESTAMP(3);

ALTER TABLE "quoteLineItem" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "invoice" ADD COLUMN "service" TEXT;
ALTER TABLE "invoice" ADD COLUMN "eventDate" DATE;
ALTER TABLE "invoice" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice" ADD COLUMN "travelFeeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice" ADD COLUMN "depositRequiredCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice" ADD COLUMN "terms" TEXT;
ALTER TABLE "invoice" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "invoice" ADD COLUMN "documentKey" TEXT;
ALTER TABLE "invoice" ADD COLUMN "documentGeneratedAt" TIMESTAMP(3);

ALTER TABLE "invoiceLineItem" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "paymentRecord" ADD COLUMN "proofReference" TEXT;
ALTER TABLE "paymentRecord" ADD COLUMN "notes" TEXT;
ALTER TABLE "paymentRecord" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "paymentRecord" ADD COLUMN "failedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "financeRule_businessUnitId_key_key";
CREATE UNIQUE INDEX "financeRule_businessUnitId_key_version_key" ON "financeRule"("businessUnitId", "key", "version");
DROP INDEX IF EXISTS "financeRule_key_idx";
CREATE INDEX "financeRule_key_active_idx" ON "financeRule"("key", "active");

DROP INDEX IF EXISTS "invoice_quoteId_idx";
CREATE UNIQUE INDEX "invoice_quoteId_key" ON "invoice"("quoteId");

CREATE INDEX "expense_operatorContactId_idx" ON "expense"("operatorContactId");

ALTER TABLE "expense" ADD CONSTRAINT "expense_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
