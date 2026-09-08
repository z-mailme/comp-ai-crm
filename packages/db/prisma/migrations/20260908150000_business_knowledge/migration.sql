CREATE TYPE "KnowledgeKind" AS ENUM ('FACT', 'POLICY', 'PRICING', 'FAQ', 'PROCESS', 'SOP', 'PRODUCT_SERVICE', 'COMMUNICATION_STYLE', 'DECISION', 'CONTACT_CONTEXT', 'COMPANY_CONTEXT', 'INFERENCE', 'RECOMMENDATION');

ALTER TYPE "BusinessEventSource" ADD VALUE 'WHATSAPP';

CREATE TABLE "businessKnowledge" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "kind" "KnowledgeKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "detail" TEXT,
    "data" JSONB,
    "sourceType" "BusinessEventSource" NOT NULL,
    "sourceId" TEXT,
    "sourceAt" TIMESTAMP(3),
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "humanConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "supersededById" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "businessKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "businessKnowledge_kind_validFrom_idx" ON "businessKnowledge"("kind", "validFrom");
CREATE INDEX "businessKnowledge_companyId_kind_idx" ON "businessKnowledge"("companyId", "kind");
CREATE INDEX "businessKnowledge_contactId_kind_idx" ON "businessKnowledge"("contactId", "kind");
CREATE INDEX "businessKnowledge_businessUnitId_kind_idx" ON "businessKnowledge"("businessUnitId", "kind");
CREATE INDEX "businessKnowledge_supersededById_idx" ON "businessKnowledge"("supersededById");

ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "businessKnowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessKnowledge" ADD CONSTRAINT "businessKnowledge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
