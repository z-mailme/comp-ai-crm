CREATE TYPE "FinanceDocumentStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'ACCEPTED', 'DECLINED', 'VOID');
CREATE TYPE "InvoiceLifecycleStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');
CREATE TYPE "FinanceLedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "FinanceLedgerEntrySource" AS ENUM ('INVOICE', 'PAYMENT', 'EXPENSE', 'ADJUSTMENT');
CREATE TYPE "FinanceEvidenceType" AS ENUM ('EMAIL', 'MESSAGE', 'EVENT', 'MANUAL', 'SYSTEM');
CREATE TYPE "FinanceAuditAction" AS ENUM ('CREATED', 'UPDATED', 'SENT', 'ACCEPTED', 'DECLINED', 'VOIDED', 'PAID', 'MATCHED', 'UNMATCHED', 'OVERRIDDEN');

CREATE TABLE "financeRule" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financeRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "FinanceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "validUntil" DATE,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quoteLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "quoteId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "InvoiceLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paymentRecord" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "invoiceId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "companyId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "paidAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "payerName" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'UNMATCHED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paymentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledgerAccount" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceLedgerAccountType" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ledgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledgerEntry" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "accountId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "source" "FinanceLedgerEntrySource" NOT NULL,
    "sourceId" TEXT,
    "memo" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financeEvidence" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "businessEventId" TEXT,
    "type" "FinanceEvidenceType" NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT,
    "occurredAt" TIMESTAMP(3),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financeAuditEvent" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "action" "FinanceAuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financeAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financeRule_businessUnitId_key_key" ON "financeRule"("businessUnitId", "key");
CREATE INDEX "financeRule_key_idx" ON "financeRule"("key");
CREATE UNIQUE INDEX "quote_number_key" ON "quote"("number");
CREATE INDEX "quote_businessUnitId_status_idx" ON "quote"("businessUnitId", "status");
CREATE INDEX "quote_dealId_idx" ON "quote"("dealId");
CREATE INDEX "quote_bookingId_idx" ON "quote"("bookingId");
CREATE INDEX "quote_companyId_idx" ON "quote"("companyId");
CREATE INDEX "quote_contactId_idx" ON "quote"("contactId");
CREATE INDEX "quote_createdAt_idx" ON "quote"("createdAt");
CREATE INDEX "quoteLineItem_quoteId_sortOrder_idx" ON "quoteLineItem"("quoteId", "sortOrder");
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");
CREATE INDEX "invoice_businessUnitId_status_idx" ON "invoice"("businessUnitId", "status");
CREATE INDEX "invoice_quoteId_idx" ON "invoice"("quoteId");
CREATE INDEX "invoice_dealId_idx" ON "invoice"("dealId");
CREATE INDEX "invoice_bookingId_idx" ON "invoice"("bookingId");
CREATE INDEX "invoice_companyId_idx" ON "invoice"("companyId");
CREATE INDEX "invoice_contactId_idx" ON "invoice"("contactId");
CREATE INDEX "invoice_issueDate_idx" ON "invoice"("issueDate");
CREATE INDEX "invoice_dueDate_idx" ON "invoice"("dueDate");
CREATE INDEX "invoiceLineItem_invoiceId_sortOrder_idx" ON "invoiceLineItem"("invoiceId", "sortOrder");
CREATE INDEX "paymentRecord_businessUnitId_paidAt_idx" ON "paymentRecord"("businessUnitId", "paidAt");
CREATE INDEX "paymentRecord_invoiceId_idx" ON "paymentRecord"("invoiceId");
CREATE INDEX "paymentRecord_dealId_idx" ON "paymentRecord"("dealId");
CREATE INDEX "paymentRecord_bookingId_idx" ON "paymentRecord"("bookingId");
CREATE INDEX "paymentRecord_companyId_idx" ON "paymentRecord"("companyId");
CREATE INDEX "paymentRecord_status_idx" ON "paymentRecord"("status");
CREATE UNIQUE INDEX "ledgerAccount_businessUnitId_code_key" ON "ledgerAccount"("businessUnitId", "code");
CREATE INDEX "ledgerAccount_type_active_idx" ON "ledgerAccount"("type", "active");
CREATE INDEX "ledgerEntry_businessUnitId_occurredAt_idx" ON "ledgerEntry"("businessUnitId", "occurredAt");
CREATE INDEX "ledgerEntry_accountId_occurredAt_idx" ON "ledgerEntry"("accountId", "occurredAt");
CREATE INDEX "ledgerEntry_invoiceId_idx" ON "ledgerEntry"("invoiceId");
CREATE INDEX "ledgerEntry_paymentId_idx" ON "ledgerEntry"("paymentId");
CREATE INDEX "ledgerEntry_source_sourceId_idx" ON "ledgerEntry"("source", "sourceId");
CREATE INDEX "financeEvidence_businessUnitId_occurredAt_idx" ON "financeEvidence"("businessUnitId", "occurredAt");
CREATE INDEX "financeEvidence_quoteId_idx" ON "financeEvidence"("quoteId");
CREATE INDEX "financeEvidence_invoiceId_idx" ON "financeEvidence"("invoiceId");
CREATE INDEX "financeEvidence_paymentId_idx" ON "financeEvidence"("paymentId");
CREATE INDEX "financeEvidence_expenseId_idx" ON "financeEvidence"("expenseId");
CREATE INDEX "financeEvidence_businessEventId_idx" ON "financeEvidence"("businessEventId");
CREATE INDEX "financeAuditEvent_businessUnitId_createdAt_idx" ON "financeAuditEvent"("businessUnitId", "createdAt");
CREATE INDEX "financeAuditEvent_quoteId_createdAt_idx" ON "financeAuditEvent"("quoteId", "createdAt");
CREATE INDEX "financeAuditEvent_invoiceId_createdAt_idx" ON "financeAuditEvent"("invoiceId", "createdAt");
CREATE INDEX "financeAuditEvent_paymentId_createdAt_idx" ON "financeAuditEvent"("paymentId", "createdAt");
CREATE INDEX "financeAuditEvent_actorUserId_createdAt_idx" ON "financeAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "financeRule" ADD CONSTRAINT "financeRule_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeRule" ADD CONSTRAINT "financeRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote" ADD CONSTRAINT "quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quoteLineItem" ADD CONSTRAINT "quoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoiceLineItem" ADD CONSTRAINT "invoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paymentRecord" ADD CONSTRAINT "paymentRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledgerAccount" ADD CONSTRAINT "ledgerAccount_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledgerEntry_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "paymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "paymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeEvidence" ADD CONSTRAINT "financeEvidence_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeAuditEvent" ADD CONSTRAINT "financeAuditEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeAuditEvent" ADD CONSTRAINT "financeAuditEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeAuditEvent" ADD CONSTRAINT "financeAuditEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeAuditEvent" ADD CONSTRAINT "financeAuditEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "paymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financeAuditEvent" ADD CONSTRAINT "financeAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
