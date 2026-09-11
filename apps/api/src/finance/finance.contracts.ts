import { isCurrencyCode, normalizeCurrency } from "@crm/db/currency";
import {
	BookingStatus,
	ExpenseCategory,
	ExpenseSource,
	ExpenseStatus,
	PaymentStatus,
	type Prisma,
} from "@crm/db";
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

export const expenseMutationOutput = z.object({
	expense: expenseEntryOutput,
});

export type FinanceWeekOutput = z.infer<typeof financeWeekOutput>;
export type FinanceWeekRowOutput = z.infer<typeof financeWeekRowOutput>;
export type ExpenseEntryOutput = z.infer<typeof expenseEntryOutput>;
