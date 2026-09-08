import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	BookingStatus,
	BusinessEventSource,
	BusinessUnitStatus,
	CommunicationChannel,
	CustomerIdentityKind,
	CustomerIdentityStatus,
	DealStage,
	db,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { BUSINESS_OS_REPORTS } from "../src/business-os/business-os.config";
import { BusinessOsService } from "../src/business-os/business-os.service";
import {
	countIntoWeeks,
	utcWeekStarts,
} from "../src/business-os/weekly-buckets";
import { ConversionService } from "../src/currency/conversion.service";

const itWithDb = process.env.DATABASE_URL ? it : it.skip;

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `feeds-${suffix}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;
const companyId = `company-${marker}`;
const contactId = `contact-${marker}`;
const openDealId = `deal-open-${marker}`;
const wonDealId = `deal-won-${marker}`;
const upcomingBookingId = `booking-up-${marker}`;
const pastBookingId = `booking-past-${marker}`;
const noteActivityId = `activity-note-${marker}`;
const callActivityId = `activity-call-${marker}`;
const foreignCompanyId = `company-foreign-${marker}`;
const foreignDealId = `deal-foreign-${marker}`;
const foreignBookingId = `booking-foreign-${marker}`;
const foreignActivityId = `activity-foreign-${marker}`;
const source = { userId, businessUnitId: unitId };
const service = new BusinessOsService(db, new ConversionService(db));

describe("weekly buckets", () => {
	it("starts weeks on Monday in UTC and keeps the newest week last", () => {
		const starts = utcWeekStarts(new Date("2026-09-07T12:00:00.000Z"), 12);

		expect(starts).toHaveLength(12);
		expect(starts[11]?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
		expect(starts[0]?.toISOString()).toBe("2026-06-22T00:00:00.000Z");

		for (const start of starts) {
			expect(start.getUTCDay()).toBe(1);
		}
	});

	it("counts each date into the newest week that started before it", () => {
		const starts = utcWeekStarts(new Date("2026-09-07T12:00:00.000Z"), 12);
		const counts = countIntoWeeks(
			[
				new Date("2026-06-21T23:59:59.000Z"),
				new Date("2026-06-22T00:00:00.000Z"),
				new Date("2026-09-07T08:00:00.000Z"),
				new Date("2026-09-07T18:30:00.000Z"),
			],
			starts,
		);

		expect(counts[0]).toBe(1);
		expect(counts[11]).toBe(2);
		expect(counts.reduce((total, count) => total + count, 0)).toBe(3);
	});
});

describe("business os feeds", () => {
	beforeAll(async () => {
		if (!process.env.DATABASE_URL) return;
		await clean();
		await seed();
	});

	afterAll(async () => {
		if (!process.env.DATABASE_URL) return;
		await clean();
	});

	itWithDb(
		"activityFeed returns scoped activities and filters by type",
		async () => {
			const feed = await service.activityFeed(source, { limit: 50 });

			expect(feed.entries.map((row) => row.id)).toEqual(
				expect.arrayContaining([noteActivityId, callActivityId]),
			);

			const note = feed.entries.find((row) => row.id === noteActivityId);

			expect(note).toMatchObject({
				type: ActivityType.NOTE,
				author: { id: userId },
				company: { id: companyId },
				deal: { id: openDealId },
			});
			expect(note?.contact).toMatchObject({ id: contactId });
			expect(feed.entries.map((row) => row.id)).not.toContain(
				foreignActivityId,
			);

			const notesOnly = await service.activityFeed(source, {
				type: ActivityType.NOTE,
				limit: 50,
			});

			expect(notesOnly.entries.map((row) => row.id)).toContain(noteActivityId);
			expect(notesOnly.entries.map((row) => row.id)).not.toContain(
				callActivityId,
			);

			const page = await service.activityFeed(source, { limit: 1 });
			const first = page.entries[0];

			expect(first).toBeDefined();
			expect(page.entries).toHaveLength(1);

			if (page.nextCursor) {
				const next = await service.activityFeed(source, {
					limit: 50,
					cursor: page.nextCursor,
				});

				expect(next.entries.map((row) => row.id)).not.toContain(first?.id);
			}
		},
	);

	itWithDb(
		"bookings splits upcoming and past and searches by deal",
		async () => {
			const upcoming = await service.bookings(source, {
				when: "upcoming",
				search: "",
				limit: 50,
			});

			expect(upcoming.bookings.map((row) => row.id)).toContain(
				upcomingBookingId,
			);
			expect(upcoming.bookings.map((row) => row.id)).not.toContain(
				pastBookingId,
			);
			expect(upcoming.bookings.map((row) => row.id)).not.toContain(
				foreignBookingId,
			);

			const row = upcoming.bookings.find(
				(booking) => booking.id === upcomingBookingId,
			);

			expect(row).toMatchObject({
				status: BookingStatus.CONFIRMED,
				deal: { id: openDealId, amountCents: 1250000, currency: "USD" },
				company: { id: companyId },
			});
			expect(row?.startsAt).toBe("2027-01-10T15:00:00.000Z");

			const past = await service.bookings(source, {
				when: "past",
				search: "",
				limit: 50,
			});

			expect(past.bookings.map((booking) => booking.id)).toContain(
				pastBookingId,
			);

			const searched = await service.bookings(source, {
				when: "upcoming",
				search: `Open ${marker}`,
				limit: 50,
			});

			expect(searched.bookings.map((booking) => booking.id)).toEqual([
				upcomingBookingId,
			]);
		},
	);

	itWithDb(
		"analytics reports pipeline, outcomes and weekly activity",
		async () => {
			const analytics = await service.analytics(source);

			expect(analytics.reportingCurrency).toBe("USD");
			expect(analytics.weekly).toHaveLength(
				BUSINESS_OS_REPORTS.weeklyWindowWeeks,
			);

			const demo = analytics.pipeline.stages.find(
				(row) => row.stage === DealStage.DEMO_BOOKED,
			);

			expect(demo?.count).toBe(1);
			expect(demo?.baseValueCents).toBe(1250000);
			expect(analytics.pipeline.openCount).toBe(1);
			expect(analytics.pipeline.openBaseValueCents).toBe(1250000);
			expect(analytics.outcomes90d.wonCount).toBe(1);
			expect(analytics.outcomes90d.wonBaseValueCents).toBe(2000000);
			expect(analytics.outcomes90d.winRate).toBe(1);

			const currentWeek = analytics.weekly[analytics.weekly.length - 1];

			expect(currentWeek?.dealsCreated).toBeGreaterThanOrEqual(2);
			expect(currentWeek?.activities).toBeGreaterThanOrEqual(2);
		},
	);

	itWithDb("finance reports pipeline value and upcoming closes", async () => {
		const finance = await service.finance(source);

		expect(finance.reportingCurrency).toBe("USD");
		expect(finance.openPipeline.count).toBe(1);
		expect(finance.openPipeline.baseValueCents).toBe(1250000);
		expect(finance.wonAllTime.count).toBe(1);
		expect(finance.wonAllTime.baseValueCents).toBe(2000000);
		expect(finance.avgOpenDealCents).toBe(1250000);

		const closing = finance.closingSoon.find((row) => row.id === openDealId);

		expect(closing).toMatchObject({
			companyName: `Company ${marker}`,
			amountCents: 1250000,
			baseAmountCents: 1250000,
		});
	});
});

async function seed(): Promise<void> {
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
	await db.user.create({
		data: {
			id: userId,
			name: "Feeds Tester",
			email: `${userId}@example.test`,
		},
	});
	await db.member.create({
		data: {
			id: `member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
	});
	await db.businessUnit.create({
		data: {
			id: unitId,
			name: `Feeds Unit ${marker}`,
			slug: `feeds-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Company ${marker}`,
			ownerId: userId,
		},
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: `Buyer ${marker}`,
			email: `buyer-${marker}@example.test`,
			companyId,
			ownerId: userId,
		},
	});
	await db.deal.create({
		data: {
			id: openDealId,
			name: `Open ${marker}`,
			companyId,
			ownerId: userId,
			stage: DealStage.DEMO_BOOKED,
			amount: 12500,
			currency: "USD",
			baseAmount: 12500,
			baseCurrency: "USD",
			expectedCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		},
	});
	await db.deal.create({
		data: {
			id: wonDealId,
			name: `Won ${marker}`,
			companyId,
			ownerId: userId,
			stage: DealStage.CLOSED_WON,
			amount: 20000,
			currency: "USD",
			baseAmount: 20000,
			baseCurrency: "USD",
			closedAt: new Date(),
		},
	});
	await db.booking.create({
		data: {
			id: upcomingBookingId,
			dealId: openDealId,
			bookingKey: `booking-up-${marker}`,
			status: BookingStatus.CONFIRMED,
			eventDate: new Date("2027-01-10T00:00:00.000Z"),
			requestedStartAt: new Date("2027-01-10T14:00:00.000Z"),
			confirmedStartAt: new Date("2027-01-10T15:00:00.000Z"),
			confirmedEndAt: new Date("2027-01-10T16:00:00.000Z"),
		},
	});
	await db.booking.create({
		data: {
			id: pastBookingId,
			dealId: wonDealId,
			bookingKey: `booking-past-${marker}`,
			eventDate: new Date("2026-01-10T00:00:00.000Z"),
		},
	});
	await db.activity.create({
		data: {
			id: noteActivityId,
			type: ActivityType.NOTE,
			subject: `Note ${marker}`,
			companyId,
			contactId,
			dealId: openDealId,
			createdById: userId,
		},
	});
	await db.activity.create({
		data: {
			id: callActivityId,
			type: ActivityType.CALL,
			subject: `Call ${marker}`,
			companyId,
			createdById: userId,
		},
	});
	await db.customerIdentity.create({
		data: {
			businessUnitId: unitId,
			contactId,
			companyId,
			kind: CustomerIdentityKind.EMAIL,
			channel: CommunicationChannel.EMAIL,
			value: `buyer-${marker}@example.test`,
			status: CustomerIdentityStatus.VERIFIED,
		},
	});
	await db.businessEvent.createMany({
		data: [
			{
				id: `event-open-${marker}`,
				businessUnitId: unitId,
				type: "deal.created",
				source: BusinessEventSource.CRM,
				dealId: openDealId,
				bookingId: upcomingBookingId,
				occurredAt: new Date(),
				data: {},
				correlationId: marker,
			},
			{
				id: `event-won-${marker}`,
				businessUnitId: unitId,
				type: "deal.closed",
				source: BusinessEventSource.CRM,
				dealId: wonDealId,
				bookingId: pastBookingId,
				occurredAt: new Date(),
				data: {},
				correlationId: marker,
			},
		],
	});
	await db.company.create({
		data: {
			id: foreignCompanyId,
			name: `Foreign ${marker}`,
			ownerId: userId,
		},
	});
	await db.deal.create({
		data: {
			id: foreignDealId,
			name: `Foreign ${marker}`,
			companyId: foreignCompanyId,
			ownerId: userId,
			stage: DealStage.DEMO_BOOKED,
			amount: 99000,
			currency: "USD",
			baseAmount: 99000,
			baseCurrency: "USD",
		},
	});
	await db.booking.create({
		data: {
			id: foreignBookingId,
			dealId: foreignDealId,
			bookingKey: `booking-foreign-${marker}`,
			eventDate: new Date("2027-02-01T00:00:00.000Z"),
		},
	});
	await db.activity.create({
		data: {
			id: foreignActivityId,
			type: ActivityType.NOTE,
			subject: `Foreign ${marker}`,
			companyId: foreignCompanyId,
			dealId: foreignDealId,
			createdById: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { correlationId: marker },
	});
	await db.customerIdentity.deleteMany({
		where: { value: { contains: marker } },
	});
	await db.activity.deleteMany({
		where: { subject: { contains: marker } },
	});
	await db.booking.deleteMany({
		where: { bookingKey: { contains: marker } },
	});
	await db.deal.deleteMany({
		where: { name: { contains: marker } },
	});
	await db.contact.deleteMany({
		where: { id: contactId },
	});
	await db.company.deleteMany({
		where: { id: { in: [companyId, foreignCompanyId] } },
	});
	await db.businessUnit.deleteMany({
		where: { slug: { contains: marker } },
	});
	await db.member.deleteMany({
		where: { userId },
	});
	await db.user.deleteMany({
		where: { id: userId },
	});
}
