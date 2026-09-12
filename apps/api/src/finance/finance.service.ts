import type { Db, Prisma } from "@crm/db";
import {
	BookingStatus,
	ExpenseCategory,
	ExpenseSource,
	ExpenseStatus,
	PaymentStatus,
} from "@crm/db/enums";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	type BusinessContext,
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { DAY_MS } from "../business-os/business-os.config";
import {
	bookingScope,
	directBusinessUnitScope,
} from "../business-os/business-os.service";
import { toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type ExpenseEntryOutput,
	type ExpenseEvidence,
	type FinanceWeekOutput,
	type FinanceWeekRowOutput,
	parseExpenseEvidence,
} from "./finance.contracts";
import { FINANCE } from "./finance-config";
import {
	bookingDurationMinutes,
	operatorCountOf,
	operatorLabourCostCents,
	operatorRateCents,
} from "./operator-labour";

const CALCULATED_KEY_PREFIX = "operator-labour:";

const WEEK_BOOKING_SELECT = {
	id: true,
	dealId: true,
	bookingKey: true,
	status: true,
	eventDate: true,
	requestedStartAt: true,
	requestedEndAt: true,
	confirmedStartAt: true,
	confirmedEndAt: true,
	operationalStartAt: true,
	operationalEndAt: true,
	resources: {
		select: { resourceType: true, quantity: true },
	},
	deal: {
		select: {
			id: true,
			name: true,
			stage: true,
			amount: true,
			currency: true,
			baseAmount: true,
			baseCurrency: true,
			paymentStatus: true,
			depositAmount: true,
			company: { select: { name: true } },
		},
	},
	emailThreads: {
		select: { id: true, subject: true, lastMessageAt: true },
		orderBy: { lastMessageAt: "desc" },
		take: FINANCE.maxEvidenceThreads,
	},
} as const satisfies Prisma.BookingSelect;

type WeekBooking = Prisma.BookingGetPayload<{
	select: typeof WEEK_BOOKING_SELECT;
}>;

type ExpenseRow = Prisma.ExpenseGetPayload<{
	select: {
		id: true;
		bookingId: true;
		dealId: true;
		category: true;
		source: true;
		status: true;
		amountCents: true;
		currency: true;
		incurredAt: true;
		note: true;
		evidence: true;
	};
}>;

const EXPENSE_SELECT = {
	id: true,
	bookingId: true,
	dealId: true,
	category: true,
	source: true,
	status: true,
	amountCents: true,
	currency: true,
	incurredAt: true,
	note: true,
	evidence: true,
} as const satisfies Prisma.ExpenseSelect;

const CONFIRMED_BOOKING_STATUSES = [
	BookingStatus.CONFIRMED,
	BookingStatus.COMPLETED,
] as const;

@Injectable()
export class FinanceService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly conversion: ConversionService,
	) {}

	async week(
		source: BusinessContextSource,
		input: { businessUnitId?: string; weekStart?: string },
	): Promise<FinanceWeekOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();
		const start = mondayOf(input.weekStart);
		const end = new Date(start.getTime() + FINANCE.weekDays * DAY_MS);

		const bookings = await this.db.booking.findMany({
			where: {
				AND: [
					bookingScope(context),
					{ eventDate: { gte: start, lt: end } },
					{ status: { not: BookingStatus.CANCELLED } },
				],
			},
			orderBy: [{ eventDate: "asc" }, { bookingKey: "asc" }],
			select: WEEK_BOOKING_SELECT,
		});

		await this.reconcileLabour(context, bookings);

		const expenses = await this.db.expense.findMany({
			where: {
				AND: [
					directBusinessUnitScope(context),
					{ status: { not: ExpenseStatus.CANCELLED } },
					{ incurredAt: { gte: start, lt: end } },
				],
			},
			orderBy: [{ incurredAt: "asc" }, { createdAt: "asc" }],
			select: EXPENSE_SELECT,
		});

		const expensesByBooking = new Map<string, ExpenseRow[]>();
		for (const expense of expenses) {
			if (!expense.bookingId) continue;
			const group = expensesByBooking.get(expense.bookingId);
			if (group) group.push(expense);
			else expensesByBooking.set(expense.bookingId, [expense]);
		}

		const rows = bookings.map((booking) =>
			this.weekRow(booking, base, expensesByBooking.get(booking.id) ?? []),
		);

		const labourIncluded =
			base === FINANCE.operatorLabour.currency.toUpperCase();
		const labourCents = labourIncluded
			? expenses
					.filter(
						(expense) =>
							expense.category === ExpenseCategory.OPERATOR_LABOUR &&
							expense.currency.toUpperCase() === base,
					)
					.reduce((total, expense) => total + expense.amountCents, 0)
			: 0;
		const otherExpensesCents = expenses
			.filter(
				(expense) =>
					expense.category !== ExpenseCategory.OPERATOR_LABOUR &&
					expense.currency.toUpperCase() === base,
			)
			.reduce((total, expense) => total + expense.amountCents, 0);
		const unconvertedExpenseCount = expenses.filter(
			(expense) => expense.currency.toUpperCase() !== base,
		).length;

		const expectedRevenueCents = rows.reduce(
			(total, row) => total + (row.revenueCents ?? 0),
			0,
		);
		const confirmedRevenueCents = rows
			.filter((row) =>
				(CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]).includes(
					row.status,
				),
			)
			.reduce((total, row) => total + (row.revenueCents ?? 0), 0);
		const paymentsReceivedCents = rows.reduce(
			(total, row) => total + (row.paymentsReceivedCents ?? 0),
			0,
		);
		const unconvertedDealCount = rows.filter((row) =>
			row.issues.includes("REVENUE_UNCONVERTED"),
		).length;

		const projectedGrossProfitCents =
			labourIncluded &&
			unconvertedDealCount === 0 &&
			unconvertedExpenseCount === 0
				? expectedRevenueCents - labourCents - otherExpensesCents
				: null;

		return {
			reportingCurrency: base,
			generatedAt: new Date().toISOString(),
			week: { start: start.toISOString(), end: end.toISOString() },
			totals: {
				events: rows.length,
				confirmedEvents: rows.filter((row) =>
					(CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]).includes(
						row.status,
					),
				).length,
				expectedRevenueCents,
				confirmedRevenueCents,
				priceNeededCount: rows.filter((row) => row.priceNeeded).length,
				paymentsReceivedCents,
				outstandingCents: Math.max(
					expectedRevenueCents - paymentsReceivedCents,
					0,
				),
				operatorLabourCents: labourCents,
				operatorLabourCurrency: FINANCE.operatorLabour.currency,
				labourExcludedFromTotals: !labourIncluded,
				otherExpensesCents,
				projectedGrossProfitCents,
				unconvertedDealCount,
				unconvertedExpenseCount,
			},
			rows,
			expenses: expenses.map(toExpenseEntry),
		};
	}

	async addExpense(
		source: BusinessContextSource & { userId: string },
		input: {
			businessUnitId?: string;
			bookingId?: string;
			dealId?: string;
			category: ExpenseCategory;
			amountCents: number;
			currency?: string;
			incurredAt: string;
			note?: string;
		},
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();

		if (input.bookingId) {
			const booking = await this.db.booking.findFirst({
				where: { AND: [{ id: input.bookingId }, bookingScope(context)] },
				select: { id: true, dealId: true },
			});
			if (!booking) {
				throw new NotFoundException(`No booking with id ${input.bookingId}.`);
			}
			if (input.dealId && input.dealId !== booking.dealId) {
				throw new BadRequestException(
					"That booking belongs to a different deal.",
				);
			}
			input = { ...input, dealId: booking.dealId };
		} else if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { id: true },
			});
			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}
		}

		const expense = await this.db.expense.create({
			data: {
				businessUnitId: context.businessUnitId,
				bookingId: input.bookingId ?? null,
				dealId: input.dealId ?? null,
				category: input.category,
				source: ExpenseSource.MANUAL,
				status: ExpenseStatus.RECORDED,
				amountCents: input.amountCents,
				currency: input.currency ?? base,
				incurredAt: dayDate(input.incurredAt),
				note: input.note ?? null,
				createdById: source.userId,
			},
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(expense) };
	}

	async cancelExpense(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);

		const expense = await this.db.expense.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { ...EXPENSE_SELECT },
		});

		if (!expense) {
			throw new NotFoundException(`No expense with id ${input.id}.`);
		}
		if (expense.source === ExpenseSource.CALCULATED) {
			throw new BadRequestException(
				"Calculated operator labour follows the booking; change the booking instead.",
			);
		}

		const updated = await this.db.expense.update({
			where: { id: expense.id },
			data: { status: ExpenseStatus.CANCELLED },
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(updated) };
	}

	async markExpensePaid(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);

		const expense = await this.db.expense.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { ...EXPENSE_SELECT },
		});

		if (!expense) {
			throw new NotFoundException(`No expense with id ${input.id}.`);
		}
		if (expense.status === ExpenseStatus.CANCELLED) {
			throw new BadRequestException("A cancelled expense cannot be paid.");
		}

		const updated = await this.db.expense.update({
			where: { id: expense.id },
			data: { status: ExpenseStatus.PAID },
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(updated) };
	}

	private async reconcileLabour(
		context: BusinessContext,
		bookings: WeekBooking[],
	): Promise<void> {
		const bookingIds = bookings.map((booking) => booking.id);
		if (bookingIds.length === 0) return;

		const existing = await this.db.expense.findMany({
			where: {
				source: ExpenseSource.CALCULATED,
				bookingId: { in: bookingIds },
			},
			select: {
				id: true,
				bookingId: true,
				dealId: true,
				status: true,
				amountCents: true,
				currency: true,
				incurredAt: true,
				evidence: true,
			},
		});
		const byBooking = new Map(
			existing.map((expense) => [expense.bookingId, expense]),
		);

		for (const booking of bookings) {
			const durationMinutes = bookingDurationMinutes(booking);
			const operatorCount = operatorCountOf(booking.resources);
			const costCents = operatorLabourCostCents(durationMinutes, operatorCount);
			const current = byBooking.get(booking.id);
			const derivedStatus =
				current?.status === ExpenseStatus.PAID
					? ExpenseStatus.PAID
					: labourStatusOf(booking);

			if (
				costCents === null ||
				durationMinutes === null ||
				operatorCount === null
			) {
				if (current) {
					await this.db.expense.delete({ where: { id: current.id } });
				}
				continue;
			}

			const evidence: ExpenseEvidence = {
				kind: "operator-labour-calc",
				durationMinutes,
				operatorCount,
				rateCents: operatorRateCents(durationMinutes),
			};

			const unchanged =
				current &&
				current.amountCents === costCents &&
				current.dealId === booking.dealId &&
				current.status === derivedStatus &&
				current.incurredAt.getTime() === booking.eventDate.getTime() &&
				parseExpenseEvidence(current.evidence)?.durationMinutes ===
					durationMinutes &&
				parseExpenseEvidence(current.evidence)?.operatorCount === operatorCount;

			if (unchanged) continue;

			await this.db.expense.upsert({
				where: {
					calculationKey: `${CALCULATED_KEY_PREFIX}${booking.id}`,
				},
				create: {
					businessUnitId: context.businessUnitId,
					bookingId: booking.id,
					dealId: booking.dealId,
					category: ExpenseCategory.OPERATOR_LABOUR,
					source: ExpenseSource.CALCULATED,
					status: derivedStatus,
					amountCents: costCents,
					currency: FINANCE.operatorLabour.currency,
					incurredAt: booking.eventDate,
					note: "Auto-calculated operator labour",
					evidence,
					calculationKey: `${CALCULATED_KEY_PREFIX}${booking.id}`,
				},
				update: {
					dealId: booking.dealId,
					amountCents: costCents,
					incurredAt: booking.eventDate,
					evidence,
					status: derivedStatus,
				},
			});
		}
	}

	private weekRow(
		booking: WeekBooking,
		base: string,
		expenses: ExpenseRow[],
	): FinanceWeekRowOutput {
		const deal = booking.deal;
		const durationMinutes = bookingDurationMinutes(booking);
		const operatorCount = operatorCountOf(booking.resources);
		const operatorCost = operatorLabourCostCents(
			durationMinutes,
			operatorCount,
		);

		const amountCents = toCents(deal.amount);
		const converted =
			deal.baseCurrency === base && deal.baseAmount !== null
				? toCents(deal.baseAmount)
				: null;
		const priceNeeded = amountCents === null;
		const revenueUnconverted = !priceNeeded && converted === null;
		const revenueCents = priceNeeded ? null : converted;

		const paymentsReceivedCents = paymentReceivedCents(deal, base);
		const otherExpensesCents = expenses
			.filter(
				(expense) =>
					expense.category !== ExpenseCategory.OPERATOR_LABOUR &&
					expense.currency.toUpperCase() === base,
			)
			.reduce((total, expense) => total + expense.amountCents, 0);

		const issues: FinanceWeekRowOutput["issues"] = [];
		if (priceNeeded) issues.push("PRICE_NEEDED");
		if (operatorCount === null) issues.push("OPERATOR_COUNT_NEEDED");
		if (durationMinutes === null) issues.push("DURATION_NEEDED");
		if (revenueUnconverted) issues.push("REVENUE_UNCONVERTED");

		const projectedMarginCents =
			revenueCents !== null && operatorCost !== null
				? revenueCents - operatorCost - otherExpensesCents
				: null;

		return {
			bookingId: booking.id,
			bookingKey: booking.bookingKey,
			dealId: deal.id,
			event: deal.name,
			company: deal.company.name,
			status: booking.status,
			eventDate: booking.eventDate.toISOString().slice(0, 10),
			startsAt:
				(
					booking.confirmedStartAt ??
					booking.operationalStartAt ??
					booking.requestedStartAt
				)?.toISOString() ?? null,
			endsAt:
				(
					booking.confirmedEndAt ??
					booking.operationalEndAt ??
					booking.requestedEndAt
				)?.toISOString() ?? null,
			durationMinutes,
			revenueCents,
			priceNeeded,
			paymentStatus: deal.paymentStatus,
			paymentsReceivedCents,
			operatorCount,
			operatorRateCents:
				durationMinutes === null ? null : operatorRateCents(durationMinutes),
			operatorCostCents: operatorCost,
			estimatedLabourWithOneOperatorCents:
				operatorCost === null &&
				durationMinutes !== null &&
				operatorCount === null
					? operatorRateCents(durationMinutes)
					: null,
			otherExpensesCents,
			projectedMarginCents,
			issues,
			evidence: booking.emailThreads.map((thread) => ({
				kind: "email-thread" as const,
				id: thread.id,
				label: thread.subject ?? "Email thread",
				occurredAt: thread.lastMessageAt?.toISOString() ?? null,
			})),
		};
	}
}

function paymentReceivedCents(
	deal: WeekBooking["deal"],
	base: string,
): number | null {
	if (deal.paymentStatus === PaymentStatus.FULLY_PAID) {
		if (deal.baseCurrency === base && deal.baseAmount !== null) {
			return toCents(deal.baseAmount);
		}
		return deal.currency.toUpperCase() === base ? toCents(deal.amount) : null;
	}

	if (deal.paymentStatus === PaymentStatus.DEPOSIT_PAID) {
		return deal.currency.toUpperCase() === base
			? toCents(deal.depositAmount)
			: null;
	}

	return null;
}

function toExpenseEntry(expense: ExpenseRow): ExpenseEntryOutput {
	return {
		id: expense.id,
		bookingId: expense.bookingId,
		dealId: expense.dealId,
		category: expense.category,
		source: expense.source,
		status: expense.status,
		amountCents: expense.amountCents,
		currency: expense.currency,
		incurredAt: expense.incurredAt.toISOString().slice(0, 10),
		note: expense.note,
		evidence: parseExpenseEvidence(expense.evidence),
	};
}

function labourStatusOf(booking: WeekBooking): ExpenseStatus {
	const todayStart = new Date(
		Date.UTC(
			new Date().getUTCFullYear(),
			new Date().getUTCMonth(),
			new Date().getUTCDate(),
		),
	);
	const eventPassed = booking.eventDate.getTime() < todayStart.getTime();
	const settled = (
		CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]
	).includes(booking.status);
	return eventPassed && settled
		? ExpenseStatus.CONFIRMED
		: ExpenseStatus.PROJECTED;
}

function dayDate(value: string): Date {
	const date = new Date(`${value}T00:00:00.000Z`);
	if (
		Number.isNaN(date.getTime()) ||
		date.toISOString().slice(0, 10) !== value
	) {
		throw new BadRequestException("incurredAt must be a real calendar date.");
	}
	return date;
}

function mondayOf(weekStart?: string): Date {
	const today = weekStart
		? dayDate(weekStart)
		: new Date(
				Date.UTC(
					new Date().getUTCFullYear(),
					new Date().getUTCMonth(),
					new Date().getUTCDate(),
				),
			);
	const mondayOffset = (today.getUTCDay() + 6) % 7;
	return new Date(today.getTime() - mondayOffset * DAY_MS);
}
