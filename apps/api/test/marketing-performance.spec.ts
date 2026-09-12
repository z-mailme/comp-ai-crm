import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BusinessEventSource,
	BusinessUnitStatus,
	CommunicationChannel,
	DealStage,
	db,
	MarketingCampaignStatus,
	MarketingProvider,
	RecordSource,
} from "@crm/db";
import { readReportingCurrency } from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { MarketingAttributionService } from "../src/marketing/attribution.service";
import { MarketingCampaignsService } from "../src/marketing/campaigns.service";
import { MarketingService } from "../src/marketing/marketing.service";

const marker = `marketing-perf-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;
const companyId = `company-${marker}`;

const context = { userId, businessUnitId: unitId };

const attribution = new MarketingAttributionService(db);
const marketing = new MarketingService(
	db,
	{} as never,
	{} as never,
	{ pendingSchedules: async () => [] } as never,
	attribution,
);
const campaigns = new MarketingCampaignsService(db, attribution);

let reportingCurrency = "USD";

async function seedContact(key: string, source: string, medium: string) {
	const contact = await db.contact.create({
		data: {
			firstName: key,
			email: `${key}@${marker}.test`,
			source: RecordSource.MANUAL,
		},
	});
	await db.trackedVisitor.create({
		data: {
			id: `visitor-${key}-${marker}`.slice(0, 64),
			contactId: contact.id,
			firstCampaign: "spring-sale",
			firstSource: source,
			firstMedium: medium,
		},
	});
	return contact;
}

async function seed(): Promise<void> {
	reportingCurrency = await readReportingCurrency(db);
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
			name: "Performance Tester",
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
			name: `Performance Unit ${marker}`,
			slug: `perf-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Performance Co ${marker}`,
			source: RecordSource.MANUAL,
		},
	});

	const ana = await seedContact("ana", "google", "cpc");
	await seedContact("ben", "facebook", "paid-social");

	const deal = await db.deal.create({
		data: {
			name: `Won deal ${marker}`,
			companyId,
			ownerId: userId,
			stage: DealStage.CLOSED_WON,
			baseAmount: 2500,
			baseCurrency: reportingCurrency,
			closedAt: new Date(),
		},
	});
	await db.dealContact.create({
		data: { dealId: deal.id, contactId: ana.id },
	});
	const booking = await db.booking.create({
		data: {
			dealId: deal.id,
			status: "CONFIRMED",
			eventDate: new Date("2026-10-01"),
		},
	});
	await db.businessEvent.create({
		data: {
			businessUnitId: unitId,
			type: "deal.won",
			source: BusinessEventSource.SYSTEM,
			channel: CommunicationChannel.INTERNAL,
			occurredAt: new Date(),
			data: {},
			dealId: deal.id,
			idempotencyKey: `perf:deal:${marker}`,
		},
	});
	await db.businessEvent.create({
		data: {
			businessUnitId: unitId,
			type: "booking.created",
			source: BusinessEventSource.SYSTEM,
			channel: CommunicationChannel.INTERNAL,
			occurredAt: new Date(),
			data: {},
			bookingId: booking.id,
			idempotencyKey: `perf:booking:${marker}`,
		},
	});

	await db.marketingCampaign.create({
		data: {
			businessUnitId: unitId,
			name: "Search — Weddings",
			status: MarketingCampaignStatus.ACTIVE,
			channels: ["GOOGLE_ADS"],
			utmCampaign: "spring-sale",
			createdById: userId,
		},
	});
	await db.marketingCampaign.create({
		data: {
			businessUnitId: unitId,
			name: `No tracking ${marker}`,
			status: MarketingCampaignStatus.DRAFT,
			channels: [],
			createdById: userId,
		},
	});

	await db.marketingAdsSnapshot.create({
		data: {
			businessUnitId: unitId,
			provider: MarketingProvider.GOOGLE_ADS,
			kind: "campaigns",
			payload: {
				campaigns: [
					{
						id: "g-1",
						name: "Search — Weddings",
						status: "ENABLED",
						type: "SEARCH",
						budgetMicros: null,
						spendMicros: 10_000_000,
						impressions: 5000,
						clicks: 250,
						ctr: 0.05,
						cpcMicros: 40_000,
						conversions: 4,
						conversionValue: null,
						cpaMicros: null,
						roas: null,
						reach: null,
						cpmMicros: null,
						costPerResultMicros: null,
						children: [],
					},
				],
				searchTerms: [],
			},
		},
	});
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { contains: marker } },
	});
	await db.marketingAdsSnapshot.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.marketingCampaign.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.booking.deleteMany({
		where: { deal: { name: { contains: marker } } },
	});
	await db.dealContact.deleteMany({
		where: { deal: { name: { contains: marker } } },
	});
	await db.deal.deleteMany({ where: { name: { contains: marker } } });
	await db.trackedVisitor.deleteMany({
		where: { id: { contains: marker } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${marker}.test` } },
	});
	await db.company.deleteMany({ where: { id: companyId } });
	await db.businessUnit.deleteMany({ where: { id: unitId } });
	await db.member.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await seed();
});

afterAll(async () => {
	await clean();
});

describe("marketing performance summary", () => {
	it("computes attributed leads, bookings, revenue and spend ratios", async () => {
		const summary = await marketing.performanceSummary(context, {
			range: "28d",
		});

		expect(summary.leads).toBe(2);
		expect(summary.bookings).toBe(1);
		expect(summary.attributedRevenueCents).toBe(250_000);
		expect(summary.adSpendMicros).toBe(10_000_000);
		expect(summary.costPerLeadMicros).toBe(5_000_000);
		expect(summary.costPerBookingMicros).toBe(10_000_000);
		expect(summary.roas).toBeCloseTo(250, 5);
		expect(summary.currency).toBe(reportingCurrency);
		expect(summary.attribution.available).toBe(true);
		expect(summary.attribution.attributedVisitors).toBe(2);
	});

	it("keeps attribution uncertainty visible in notes", async () => {
		const summary = await marketing.performanceSummary(context, {
			range: "today",
		});
		expect(summary.attribution.available).toBe(true);
		expect(
			summary.notes.some((note) => note.includes("ad account currency")),
		).toBe(true);
	});
});

describe("campaign performance report", () => {
	it("joins campaigns to attribution and snapshot spend by name", async () => {
		const report = await campaigns.performance(context, {});

		const matched = report.rows.find((row) => row.name === "Search — Weddings");
		expect(matched?.spendMatched).toBe(true);
		expect(matched?.spendMicros).toBe(10_000_000);
		expect(matched?.spendProvider).toBe(MarketingProvider.GOOGLE_ADS);
		expect(matched?.leads).toBe(2);
		expect(matched?.firstTouchLeads).toBe(2);
		expect(matched?.bookings).toBe(1);
		expect(matched?.closedRevenueCents).toBe(250_000);
		expect(matched?.costPerLeadMicros).toBe(5_000_000);
		expect(matched?.costPerBookingMicros).toBe(10_000_000);
		expect(matched?.roas).toBeCloseTo(250, 5);
		expect(matched?.measured).toBe(true);

		const untracked = report.rows.find(
			(row) => row.name === `No tracking ${marker}`,
		);
		expect(untracked?.measured).toBe(false);
		expect(untracked?.leads).toBe(0);
		expect(untracked?.spendMatched).toBe(false);
		expect(untracked?.spendMicros).toBeNull();
		expect(untracked?.closedRevenueCents).toBeNull();
	});
});

describe("marketing overview attribution", () => {
	it("reports live attribution and closed revenue in the reporting currency", async () => {
		const overview = await marketing.overview(context, {});

		expect(overview.attribution.available).toBe(true);
		expect(overview.attribution.attributedVisitors).toBe(2);
		expect(overview.crm.revenueCents).toBe(250_000);
		expect(overview.crm.measured).toBe(true);
		expect(overview.crm.deals).toBe(1);
		expect(overview.crm.bookings).toBe(1);
	});
});
