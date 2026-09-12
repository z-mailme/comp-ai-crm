import {
	BookingStatus,
	ExpenseCategory,
	ExpenseSource,
	ExpenseStatus,
	FinanceAuditAction,
	FinanceDocumentStatus,
	FinanceLedgerAccountType,
	FinanceLedgerEntrySource,
	InvoiceLifecycleStatus,
	PaymentMethod,
	PaymentRecordStatus,
	PaymentStatus,
	type Prisma,
} from "@crm/db";
import { isCurrencyCode, normalizeCurrency } from "@crm/db/currency";
import { z } from "zod";
import { FINANCE } from "./finance-config";

export const financeWeekInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
		weekStart: z
			.string()
			.trim()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
	})
	.optional()
	.default({});

export const financeIssue = z.enum([
	"PRICE_NEEDED",
	"OPERATOR_COUNT_NEEDED",
	"DURATION_NEEDED",
	"REVENUE_UNCONVERTED",
]);

export const expenseEvidence = z.object({
	kind: z.literal("operator-labour-calc"),
	durationMinutes: z.number(),
	operatorCount: z.number(),
	rateCents: z.number(),
});

export type ExpenseEvidence = z.infer<typeof expenseEvidence>;

export function parseExpenseEvidence(
	value: Prisma.JsonValue | null,
): ExpenseEvidence | null {
	const parsed = expenseEvidence.safeParse(value);
	return parsed.success ? parsed.data : null;
}

const expenseEntryOutput = z.object({
	id: z.string(),
	bookingId: z.string().nullable(),
	dealId: z.string().nullable(),
	category: z.nativeEnum(ExpenseCategory),
	source: z.nativeEnum(ExpenseSource),
	status: z.nativeEnum(ExpenseStatus),
	amountCents: z.number(),
	currency: z.string(),
	incurredAt: z.string(),
	note: z.string().nullable(),
	evidence: expenseEvidence.nullable(),
});

export const financeWeekRowOutput = z.object({
	bookingId: z.string(),
	bookingKey: z.string(),
	dealId: z.string(),
	event: z.string(),
	company: z.string(),
	status: z.nativeEnum(BookingStatus),
	eventDate: z.string(),
	startsAt: z.string().nullable(),
	endsAt: z.string().nullable(),
	durationMinutes: z.number().nullable(),
	revenueCents: z.number().nullable(),
	priceNeeded: z.boolean(),
	paymentStatus: z.nativeEnum(PaymentStatus),
	paymentsReceivedCents: z.number().nullable(),
	operatorCount: z.number().nullable(),
	operatorRateCents: z.number().nullable(),
	operatorCostCents: z.number().nullable(),
	estimatedLabourWithOneOperatorCents: z.number().nullable(),
	otherExpensesCents: z.number(),
	projectedMarginCents: z.number().nullable(),
	issues: z.array(financeIssue),
	evidence: z.array(
		z.object({
			kind: z.literal("email-thread"),
			id: z.string(),
			label: z.string(),
			occurredAt: z.string().nullable(),
		}),
	),
});

export const financeWeekOutput = z.object({
	reportingCurrency: z.string(),
	generatedAt: z.string(),
	week: z.object({
		start: z.string(),
		end: z.string(),
	}),
	totals: z.object({
		events: z.number(),
		confirmedEvents: z.number(),
		expectedRevenueCents: z.number(),
		confirmedRevenueCents: z.number(),
		priceNeededCount: z.number(),
		paymentsReceivedCents: z.number(),
		outstandingCents: z.number(),
		operatorLabourCents: z.number(),
		operatorLabourCurrency: z.string(),
		labourExcludedFromTotals: z.boolean(),
		otherExpensesCents: z.number(),
		projectedGrossProfitCents: z.number().nullable(),
		unconvertedDealCount: z.number(),
		unconvertedExpenseCount: z.number(),
	}),
	rows: z.array(financeWeekRowOutput),
	expenses: z.array(expenseEntryOutput),
});

export const addExpenseInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	bookingId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
	category: z.nativeEnum(ExpenseCategory),
	amountCents: z.number().int().min(1).max(999_999_999_999),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, { message: "Unsupported currency." })
		.optional(),
	incurredAt: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/),
	note: z.string().trim().min(1).max(FINANCE.noteMaxLength).optional(),
});

export const cancelExpenseInput = z.object({
	id: z.string().trim().min(1),
});

export const markExpensePaidInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const expenseMutationOutput = z.object({
	expense: expenseEntryOutput,
});

const moneySummaryOutput = z.object({
	count: z.number(),
	totalCents: z.number(),
});

const financeLinkedRecordOutput = z.object({
	id: z.string(),
	name: z.string(),
});

export const financeDashboardInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
	})
	.optional()
	.default({});

export const financeDashboardOutput = z.object({
	reportingCurrency: z.string(),
	generatedAt: z.string(),
	quotes: moneySummaryOutput,
	invoices: moneySummaryOutput.extend({
		paidCents: z.number(),
		balanceCents: z.number(),
	}),
	payments: moneySummaryOutput,
	expenses: moneySummaryOutput,
	attention: z.array(
		z.object({
			id: z.string(),
			kind: z.enum(["quote", "invoice", "payment", "expense"]),
			title: z.string(),
			detail: z.string(),
			href: z.string(),
		}),
	),
});

const lineItemInput = z.object({
	description: z.string().trim().min(1).max(300),
	quantity: z.number().int().min(1).max(999),
	unitAmountCents: z.number().int().min(0).max(999_999_999_999),
});

export const financeListInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
		search: z.string().trim().default(""),
		limit: z.number().int().min(1).max(100).default(50),
	})
	.optional()
	.default({ search: "", limit: 50 });

export const quoteCreateInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
	bookingId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	contactId: z.string().trim().min(1).optional(),
	title: z.string().trim().min(1).max(300),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, { message: "Unsupported currency." })
		.default("ZAR"),
	validUntil: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	notes: z.string().trim().max(FINANCE.noteMaxLength).optional(),
	lineItems: z.array(lineItemInput).min(1).max(50),
});

export const quoteStatusInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	status: z.enum(["READY", "SENT", "ACCEPTED", "DECLINED", "VOID"]),
});

export const quoteDetailInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

const auditOutput = z.object({
	id: z.string(),
	action: z.nativeEnum(FinanceAuditAction),
	summary: z.string(),
	createdAt: z.string(),
});

const quoteLineOutput = z.object({
	id: z.string(),
	description: z.string(),
	quantity: z.number(),
	unitAmountCents: z.number(),
	totalCents: z.number(),
	sortOrder: z.number(),
});

const quoteOutput = z.object({
	id: z.string(),
	number: z.string(),
	title: z.string(),
	status: z.nativeEnum(FinanceDocumentStatus),
	currency: z.string(),
	subtotalCents: z.number(),
	taxCents: z.number(),
	totalCents: z.number(),
	taxEnabled: z.boolean(),
	taxRateBasisPoints: z.number(),
	validUntil: z.string().nullable(),
	sentAt: z.string().nullable(),
	acceptedAt: z.string().nullable(),
	declinedAt: z.string().nullable(),
	voidedAt: z.string().nullable(),
	deal: financeLinkedRecordOutput.nullable(),
	booking: financeLinkedRecordOutput.nullable(),
	company: financeLinkedRecordOutput.nullable(),
	contact: financeLinkedRecordOutput.nullable(),
	lineItems: z.array(quoteLineOutput),
	auditEvents: z.array(auditOutput),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const quoteListOutput = z.object({
	quotes: z.array(quoteOutput),
});

export const quoteMutationOutput = z.object({
	quote: quoteOutput,
});

export const invoiceCreateInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	quoteId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
	bookingId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	contactId: z.string().trim().min(1).optional(),
	title: z.string().trim().min(1).max(300),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, { message: "Unsupported currency." })
		.default("ZAR"),
	issueDate: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/),
	dueDate: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	notes: z.string().trim().max(FINANCE.noteMaxLength).optional(),
	lineItems: z.array(lineItemInput).min(1).max(50),
});

export const invoiceStatusInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	status: z.enum(["SENT", "VOID"]),
});

const invoiceLineOutput = z.object({
	id: z.string(),
	description: z.string(),
	quantity: z.number(),
	unitAmountCents: z.number(),
	totalCents: z.number(),
	sortOrder: z.number(),
});

const invoiceOutput = z.object({
	id: z.string(),
	number: z.string(),
	title: z.string(),
	status: z.nativeEnum(InvoiceLifecycleStatus),
	currency: z.string(),
	subtotalCents: z.number(),
	taxCents: z.number(),
	totalCents: z.number(),
	paidCents: z.number(),
	balanceCents: z.number(),
	taxEnabled: z.boolean(),
	taxRateBasisPoints: z.number(),
	issueDate: z.string(),
	dueDate: z.string().nullable(),
	sentAt: z.string().nullable(),
	paidAt: z.string().nullable(),
	voidedAt: z.string().nullable(),
	quote: financeLinkedRecordOutput.nullable(),
	deal: financeLinkedRecordOutput.nullable(),
	booking: financeLinkedRecordOutput.nullable(),
	company: financeLinkedRecordOutput.nullable(),
	contact: financeLinkedRecordOutput.nullable(),
	lineItems: z.array(invoiceLineOutput),
	auditEvents: z.array(auditOutput),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const invoiceListOutput = z.object({
	invoices: z.array(invoiceOutput),
});

export const invoiceMutationOutput = z.object({
	invoice: invoiceOutput,
});

export const paymentCreateInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	invoiceId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
	bookingId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	amountCents: z.number().int().min(1).max(999_999_999_999),
	currency: z
		.string()
		.trim()
		.transform(normalizeCurrency)
		.refine(isCurrencyCode, { message: "Unsupported currency." })
		.default("ZAR"),
	paidAt: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/),
	method: z.nativeEnum(PaymentMethod).default(PaymentMethod.BANK_TRANSFER),
	reference: z.string().trim().max(200).optional(),
	payerName: z.string().trim().max(200).optional(),
});

export const paymentMatchInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	invoiceId: z.string().trim().min(1).nullable(),
});

const paymentOutput = z.object({
	id: z.string(),
	amountCents: z.number(),
	currency: z.string(),
	paidAt: z.string(),
	method: z.nativeEnum(PaymentMethod),
	reference: z.string().nullable(),
	payerName: z.string().nullable(),
	status: z.nativeEnum(PaymentRecordStatus),
	invoice: financeLinkedRecordOutput.nullable(),
	deal: financeLinkedRecordOutput.nullable(),
	booking: financeLinkedRecordOutput.nullable(),
	company: financeLinkedRecordOutput.nullable(),
	auditEvents: z.array(auditOutput),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const paymentListOutput = z.object({
	payments: z.array(paymentOutput),
});

export const paymentMutationOutput = z.object({
	payment: paymentOutput,
});

export const accountingOutput = z.object({
	accounts: z.array(
		z.object({
			id: z.string(),
			code: z.string(),
			name: z.string(),
			type: z.nativeEnum(FinanceLedgerAccountType),
			balanceCents: z.number(),
			currency: z.string(),
		}),
	),
	entries: z.array(
		z.object({
			id: z.string(),
			account: financeLinkedRecordOutput,
			source: z.nativeEnum(FinanceLedgerEntrySource),
			sourceId: z.string().nullable(),
			memo: z.string().nullable(),
			currency: z.string(),
			debitCents: z.number(),
			creditCents: z.number(),
			occurredAt: z.string(),
			createdAt: z.string(),
		}),
	),
});

export type FinanceWeekOutput = z.infer<typeof financeWeekOutput>;
export type FinanceWeekRowOutput = z.infer<typeof financeWeekRowOutput>;
export type ExpenseEntryOutput = z.infer<typeof expenseEntryOutput>;
export type FinanceDashboardOutput = z.infer<typeof financeDashboardOutput>;
export type QuoteListOutput = z.infer<typeof quoteListOutput>;
export type QuoteMutationOutput = z.infer<typeof quoteMutationOutput>;
export type InvoiceListOutput = z.infer<typeof invoiceListOutput>;
export type InvoiceMutationOutput = z.infer<typeof invoiceMutationOutput>;
export type PaymentListOutput = z.infer<typeof paymentListOutput>;
export type PaymentMutationOutput = z.infer<typeof paymentMutationOutput>;
export type AccountingOutput = z.infer<typeof accountingOutput>;
