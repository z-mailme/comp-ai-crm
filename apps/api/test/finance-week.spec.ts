import { describe, expect, it } from "bun:test";
import {
	BookingResourceType,
	BookingStatus,
	BusinessUnitStatus,
	db,
	ExpenseCategory,
	ExpenseSource,
	ExpenseStatus,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { ConversionService } from "../src/currency/conversion.service";
import { FinanceService } from "../src/finance/finance.service";
import { FINANCE } from "../src/finance/finance-config";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `finance-${suffix}`;
const userId = `finance-user-${marker}`;
const unitId = `finance-unit-${marker}`;

const SHORT_RATE = FINANCE.operatorLabour.shortRateCents;
const LONG_RATE = FINANCE.operatorLabour.longRateCents;
const THRESHOLD = FINANCE.operatorLabour.longThresholdMinutes;

const service = new FinanceService(db, new ConversionService(db));
const source = { userId, businessUnitId: unitId };

type BookingSpec = {
	key: string;
	eventDate: string;
	status?: BookingStatus;
	operators?: number;
	durationMinutes?: number;
	amount?: number;
};

async function seedWorkspace() {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Finance User",
			email: `fin-${marker}@example.test`,
		},
		update: {},
	});
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		create: {
			id: `finance-member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.businessUnit.upsert({
		where: { id: unitId },
		create: {
			id: unitId,
			name: `Unit ${marker}`,
			slug: unitId,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
		update: {},
	});
}

async function seedBooking(spec: BookingSpec) {
	await seedWorkspace();
	const company = await db.company.create({
		data: { name: `Company ${spec.key} ${marker}` },
	});
	const deal = await db.deal.create({
		data: {
			name: `Deal ${spec.key} ${marker}`,
			companyId: company.id,
			ownerId: userId,
			amount: spec.amount ?? null,
			currency: "USD",
			baseAmount: spec.amount ?? null,
			baseCurrency: spec.amount === undefined ? null : "USD",
		},
	});
	const start =
		spec.durationMinutes === undefined
			? null
			: new Date(`${spec.eventDate}T10:00:00.000Z`);
	const end =
		spec.durationMinutes === undefined || !start
			? null
			: new Date(start.getTime() + spec.durationMinutes * 60_000);
	const booking = await db.booking.create({
		data: {
			dealId: deal.id,
			bookingKey: spec.key,
			status: spec.status ?? BookingStatus.CONFIRMED,
			eventDate: new Date(`${spec.eventDate}T00:00:00.000Z`),
			confirmedStartAt: start,
			confirmedEndAt: end,
			resources:
				spec.operators === undefined
					? undefined
					: {
							create: [
								{
									resourceType: BookingResourceType.PHOTO_BOOTH_360,
									quantity: 1,
								},
								{
									resourceType: BookingResourceType.OPERATOR,
									quantity: spec.operators,
								},
							],
						},
		},
	});
	await db.businessTask.create({
		data: {
			title: `Link ${spec.key} ${marker}`,
			businessUnitId: unitId,
			bookingId: booking.id,
			dealId: deal.id,
		},
	});
	return booking;
}

async function calculatedExpenses(bookingId: string) {
	return db.expense.findMany({
		where: { bookingId, source: ExpenseSource.CALCULATED },
	});
}

describe("finance.week operator labour", () => {
	it("charges the short rate at 4h59 and the long rate from 5h00", async () => {
		const short = await seedBooking({
			key: "rate-short",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: THRESHOLD - 1,
			amount: 5000,
		});
		const exact = await seedBooking({
			key: "rate-exact",
			eventDate: "2026-09-08",
			operators: 1,
			durationMinutes: THRESHOLD,
			amount: 5000,
		});
		const over = await seedBooking({
			key: "rate-over",
			eventDate: "2026-09-09",
			operators: 1,
			durationMinutes: THRESHOLD + 1,
			amount: 5000,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const byKey = new Map(week.rows.map((row) => [row.bookingKey, row]));

		expect(byKey.get(short.bookingKey)?.operatorRateCents).toBe(SHORT_RATE);
		expect(byKey.get(short.bookingKey)?.operatorCostCents).toBe(SHORT_RATE);
		expect(byKey.get(exact.bookingKey)?.operatorRateCents).toBe(LONG_RATE);
		expect(byKey.get(exact.bookingKey)?.operatorCostCents).toBe(LONG_RATE);
		expect(byKey.get(over.bookingKey)?.operatorRateCents).toBe(LONG_RATE);
		expect(byKey.get(over.bookingKey)?.operatorCostCents).toBe(LONG_RATE);
	});

	it("multiplies the rate by the operator count", async () => {
		const twoShort = await seedBooking({
			key: "crew-short",
			eventDate: "2026-09-07",
			operators: 2,
			durationMinutes: 180,
			amount: 9000,
		});
		const twoLong = await seedBooking({
			key: "crew-long",
			eventDate: "2026-09-08",
			operators: 2,
			durationMinutes: 360,
			amount: 12000,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const byKey = new Map(week.rows.map((row) => [row.bookingKey, row]));

		expect(byKey.get(twoShort.bookingKey)?.operatorCostCents).toBe(
			2 * SHORT_RATE,
		);
		expect(byKey.get(twoLong.bookingKey)?.operatorCostCents).toBe(
			2 * LONG_RATE,
		);
	});

	it("flags a missing operator count and estimates one operator", async () => {
		const booking = await seedBooking({
			key: "no-crew",
			eventDate: "2026-09-07",
			durationMinutes: 360,
			amount: 8000,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const row = week.rows.find(
			(entry) => entry.bookingKey === booking.bookingKey,
		);

		expect(row?.issues).toContain("OPERATOR_COUNT_NEEDED");
		expect(row?.operatorCostCents).toBeNull();
		expect(row?.estimatedLabourWithOneOperatorCents).toBe(LONG_RATE);
		expect(await calculatedExpenses(booking.id)).toHaveLength(0);
	});

	it("flags a booking without times instead of assuming a duration", async () => {
		const booking = await seedBooking({
			key: "untimed",
			eventDate: "2026-09-07",
			operators: 1,
			amount: 8000,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const row = week.rows.find(
			(entry) => entry.bookingKey === booking.bookingKey,
		);

		expect(row?.issues).toContain("DURATION_NEEDED");
		expect(row?.durationMinutes).toBeNull();
		expect(row?.operatorCostCents).toBeNull();
		expect(await calculatedExpenses(booking.id)).toHaveLength(0);
	});

	it("flags a confirmed booking without a deal amount", async () => {
		const booking = await seedBooking({
			key: "unpriced",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 120,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const row = week.rows.find(
			(entry) => entry.bookingKey === booking.bookingKey,
		);

		expect(row?.priceNeeded).toBe(true);
		expect(row?.issues).toContain("PRICE_NEEDED");
		expect(row?.revenueCents).toBeNull();
		expect(week.totals.priceNeededCount).toBeGreaterThanOrEqual(1);
	});

	it("recalculates idempotently without duplicating expense rows", async () => {
		const booking = await seedBooking({
			key: "idempotent",
			eventDate: "2026-09-07",
			operators: 2,
			durationMinutes: 360,
			amount: 10000,
		});

		await service.week(source, { weekStart: "2026-09-07" });
		const first = await calculatedExpenses(booking.id);
		await service.week(source, { weekStart: "2026-09-07" });
		const second = await calculatedExpenses(booking.id);

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
		expect(second[0]?.id).toBe(first[0]?.id);
		expect(second[0]?.amountCents).toBe(2 * LONG_RATE);
	});

	it("removes the calculated row when the booking loses its times", async () => {
		const booking = await seedBooking({
			key: "labour-removed",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 360,
			amount: 10000,
		});

		await service.week(source, { weekStart: "2026-09-07" });
		expect(await calculatedExpenses(booking.id)).toHaveLength(1);

		await db.booking.update({
			where: { id: booking.id },
			data: { confirmedStartAt: null, confirmedEndAt: null },
		});
		await service.week(source, { weekStart: "2026-09-07" });

		expect(await calculatedExpenses(booking.id)).toHaveLength(0);
	});

	it("never creates agent tasks or brain analysis jobs", async () => {
		await seedBooking({
			key: "no-analysis",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 360,
			amount: 10000,
		});

		const tasksBefore = await db.agentTask.count();
		const jobsBefore = await db.brainAnalysisJob.count();

		await service.week(source, { weekStart: "2026-09-07" });
		await service.week(source, { weekStart: "2026-09-07" });

		expect(await db.agentTask.count()).toBe(tasksBefore);
		expect(await db.brainAnalysisJob.count()).toBe(jobsBefore);
	});

	it("snaps any day of the week back to its Monday", async () => {
		await seedBooking({
			key: "snap",
			eventDate: "2026-09-11",
			operators: 1,
			durationMinutes: 60,
			amount: 2000,
		});

		const week = await service.week(source, { weekStart: "2026-09-13" });

		expect(week.week.start).toBe("2026-09-07T00:00:00.000Z");
		expect(week.week.end).toBe("2026-09-14T00:00:00.000Z");
		expect(week.rows.some((row) => row.bookingKey === "snap")).toBe(true);
	});

	it("reports labour in ZAR and excludes it from foreign-currency totals", async () => {
		await seedBooking({
			key: "currency-honesty",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 360,
			amount: 10000,
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });

		expect(week.totals.operatorLabourCurrency).toBe("ZAR");
		expect(week.totals.labourExcludedFromTotals).toBe(
			week.reportingCurrency !== "ZAR",
		);
		if (week.totals.labourExcludedFromTotals) {
			expect(week.totals.operatorLabourCents).toBe(0);
			expect(week.totals.projectedGrossProfitCents).toBeNull();
		}
	});

	it("attaches email threads as row evidence", async () => {
		const booking = await seedBooking({
			key: "evidence",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 120,
			amount: 5000,
		});
		await db.emailThread.create({
			data: {
				rootMessageId: `root-${marker}@example.test`,
				subject: `Quote thread ${marker}`,
				bookingId: booking.id,
				firstMessageAt: new Date("2026-09-01T09:00:00.000Z"),
				lastMessageAt: new Date("2026-09-02T09:00:00.000Z"),
			},
		});

		const week = await service.week(source, { weekStart: "2026-09-07" });
		const row = week.rows.find((entry) => entry.bookingKey === "evidence");

		expect(row?.evidence).toHaveLength(1);
		expect(row?.evidence[0]?.label).toBe(`Quote thread ${marker}`);
	});
});

describe("finance expenses", () => {
	it("adds and cancels a manual expense", async () => {
		const booking = await seedBooking({
			key: "manual-expense",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 120,
			amount: 5000,
		});

		const added = await service.addExpense(source, {
			bookingId: booking.id,
			category: ExpenseCategory.TRAVEL,
			amountCents: 45000,
			currency: "ZAR",
			incurredAt: "2026-09-07",
			note: "Fuel",
		});

		expect(added.expense.source).toBe(ExpenseSource.MANUAL);
		expect(added.expense.status).toBe(ExpenseStatus.RECORDED);
		expect(added.expense.dealId).toBe(booking.dealId);

		const cancelled = await service.cancelExpense(source, {
			id: added.expense.id,
		});
		expect(cancelled.expense.status).toBe(ExpenseStatus.CANCELLED);

		const week = await service.week(source, { weekStart: "2026-09-07" });
		expect(week.expenses.some((entry) => entry.id === added.expense.id)).toBe(
			false,
		);
	});

	it("refuses to cancel calculated operator labour", async () => {
		const booking = await seedBooking({
			key: "calc-no-cancel",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 360,
			amount: 5000,
		});
		await service.week(source, { weekStart: "2026-09-07" });
		const [calculated] = await calculatedExpenses(booking.id);
		if (!calculated) throw new Error("expected a calculated expense");

		try {
			await service.cancelExpense(source, { id: calculated.id });
			throw new Error("cancelExpense should have thrown");
		} catch (error) {
			expect(error instanceof Error ? error.message : "").toContain(
				"change the booking instead",
			);
		}
	});

	it("marks a manual expense paid", async () => {
		const booking = await seedBooking({
			key: "manual-paid",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 120,
			amount: 5000,
		});
		const added = await service.addExpense(source, {
			bookingId: booking.id,
			category: ExpenseCategory.TRAVEL,
			amountCents: 45000,
			currency: "ZAR",
			incurredAt: "2026-09-07",
			note: "Paid fuel",
		});

		const paid = await service.markExpensePaid(source, {
			id: added.expense.id,
		});

		expect(paid.expense.status).toBe(ExpenseStatus.PAID);
		expect(paid.expense.source).toBe(ExpenseSource.MANUAL);
	});

	it("preserves paid calculated labour during reconciliation", async () => {
		const booking = await seedBooking({
			key: "calc-paid",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 360,
			amount: 5000,
		});
		await service.week(source, { weekStart: "2026-09-07" });
		const [calculated] = await calculatedExpenses(booking.id);
		if (!calculated) throw new Error("expected a calculated expense");

		await service.markExpensePaid(source, { id: calculated.id });
		await service.week(source, { weekStart: "2026-09-07" });

		const [after] = await calculatedExpenses(booking.id);
		expect(after?.status).toBe(ExpenseStatus.PAID);
	});

	it("refuses to mark a cancelled expense paid", async () => {
		const booking = await seedBooking({
			key: "cancelled-paid",
			eventDate: "2026-09-07",
			operators: 1,
			durationMinutes: 120,
			amount: 5000,
		});
		const added = await service.addExpense(source, {
			bookingId: booking.id,
			category: ExpenseCategory.TRAVEL,
			amountCents: 45000,
			currency: "ZAR",
			incurredAt: "2026-09-07",
			note: "Cancelled fuel",
		});
		await service.cancelExpense(source, { id: added.expense.id });

		try {
			await service.markExpensePaid(source, { id: added.expense.id });
			throw new Error("markExpensePaid should have thrown");
		} catch (error) {
			expect(error instanceof Error ? error.message : "").toContain(
				"cancelled expense cannot be paid",
			);
		}
	});
});
