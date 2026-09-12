import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	DealStage,
	db,
	MarketingCampaignStatus,
	RecordSource,
} from "@crm/db";
import { classifyTouch } from "@crm/db/attribution";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { MarketingAttributionService } from "../src/marketing/attribution.service";
import { MarketingCampaignsService } from "../src/marketing/campaigns.service";
import { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import { TrackingFilingService } from "../src/tracking/tracking-filing.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const marker = `marketing-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;
const companyId = `company-${marker}`;
const dealId = `deal-${marker}`;
const bookingId = `booking-${marker}`;
const visitorId = `visitor-${marker}`.slice(0, 64);
const campaignKey = `spring-sale-${marker}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	companyRequested: async () => true,
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const attribution = new MarketingAttributionService(db);
const service = new MarketingCampaignsService(db, attribution);
const filing = new TrackingFilingService(
	db,
	new TrackingCounterService(db),
	new CompanyDirectoryService(agent),
	agent,
	new ActivityStampService(db),
);

const context = { userId, businessUnitId: unitId };

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
			name: "Marketing Tester",
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
			name: `Marketing Unit ${marker}`,
			slug: `marketing-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.booking.deleteMany({ where: { id: bookingId } });
	await db.dealContact.deleteMany({ where: { dealId } });
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.activity.deleteMany({ where: { body: { contains: marker } } });
	await db.formSubmission.deleteMany({
		where: { dedupeKey: { contains: marker } },
	});
	await db.trackedVisitor.deleteMany({ where: { id: visitorId } });
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${marker}.test` } },
	});
	await db.company.deleteMany({ where: { domain: `${marker}.test` } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.marketingCampaign.deleteMany({
		where: { name: { contains: marker } },
	});
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

describe("marketing campaigns", () => {
	it("creates, lists, updates and archives a campaign", async () => {
		const created = await service.create(context, {
			name: `Spring Sale ${marker}`,
			objective: "Bookings",
			channels: ["META_ADS", "EMAIL"],
			utmCampaign: campaignKey,
			utmSource: "facebook",
			utmMedium: "cpc",
			budget: 1200,
			currency: "usd",
		});

		expect(created.status).toBe(MarketingCampaignStatus.DRAFT);
		expect(created.currency).toBe("USD");
		expect(created.channels).toEqual(["META_ADS", "EMAIL"]);

		const listed = await service.list(context, {});
		expect(listed.rows.some((row) => row.id === created.id)).toBe(true);

		const updated = await service.update(context, {
			id: created.id,
			status: MarketingCampaignStatus.ACTIVE,
			notes: "Approved by owner",
		});
		expect(updated.status).toBe(MarketingCampaignStatus.ACTIVE);
		expect(updated.utmCampaign).toBe(campaignKey);

		await service.archive(context, { id: created.id });
		const afterArchive = await service.list(context, {});
		expect(afterArchive.rows.some((row) => row.id === created.id)).toBe(false);

		const archived = await service.list(context, {
			status: MarketingCampaignStatus.ARCHIVED,
		});
		expect(archived.rows.some((row) => row.id === created.id)).toBe(true);
	});

	it("rejects an unsupported currency", async () => {
		await expect(
			service.create(context, {
				name: `Bad Currency ${marker}`,
				currency: "ZZZ",
			}),
		).rejects.toThrow("Unsupported currency");
	});

	it("scopes campaigns to the business unit", async () => {
		const otherUnit = `unit-other-${marker}`;
		await db.businessUnit.create({
			data: {
				id: otherUnit,
				name: `Other Unit ${marker}`,
				slug: `other-unit-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
		});
		try {
			const created = await service.create(
				{ userId, businessUnitId: otherUnit },
				{ name: `Other Unit Campaign ${marker}` },
			);

			const listed = await service.list(context, {});
			expect(listed.rows.some((row) => row.id === created.id)).toBe(false);

			await db.marketingCampaign.deleteMany({ where: { id: created.id } });
		} finally {
			await db.businessUnit.deleteMany({ where: { id: otherUnit } });
		}
	});
});

describe("marketing attribution", () => {
	it("persists click ids through filing and ties campaign to leads, bookings and revenue", async () => {
		const touch = classifyTouch({
			source: "facebook",
			medium: "cpc",
			campaign: campaignKey,
			fbclid: `fbclid-${marker}`,
			gclid: `gclid-${marker}`,
		});

		const submission = await db.formSubmission.create({
			data: {
				host: `${marker}.test`,
				path: "/book",
				email: `dana@${marker}.test`,
				fields: { name: "Dana", email: `dana@${marker}.test` },
				dedupeKey: `${marker}-submit`,
			},
			select: { id: true },
		});

		const outcome = await filing.file({
			id: submission.id,
			email: `dana@${marker}.test`,
			host: `${marker}.test`,
			visitorId,
			name: "Dana",
			firstTouch: touch,
			lastTouch: touch,
		});
		expect(outcome.filed).toBe(true);

		const visitor = await db.trackedVisitor.findUnique({
			where: { id: visitorId },
		});
		expect(visitor?.firstCampaign).toBe(campaignKey);
		expect(visitor?.firstFbclid).toBe(`fbclid-${marker}`);
		expect(visitor?.lastGclid).toBe(`gclid-${marker}`);

		const contact = await db.contact.findFirst({
			where: { email: `dana@${marker}.test` },
		});
		expect(contact).not.toBeNull();

		if (!contact) return;

		await db.company.create({
			data: { id: companyId, name: `Co ${marker}`, ownerId: userId },
		});
		await db.deal.create({
			data: {
				id: dealId,
				name: `Deal ${marker}`,
				companyId,
				ownerId: userId,
				stage: DealStage.CLOSED_WON,
				amount: 9400,
				currency: "USD",
				baseAmount: 9400,
				baseCurrency: "USD",
				closedAt: new Date(),
			},
		});
		await db.dealContact.create({
			data: { dealId, contactId: contact.id },
		});
		await db.booking.create({
			data: {
				id: bookingId,
				dealId,
				eventDate: new Date(),
				source: RecordSource.MANUAL,
			},
		});

		const performance =
			await attribution.performanceForUtmCampaign(campaignKey);

		expect(performance.measured).toBe(true);
		expect(performance.leads).toBe(1);
		expect(performance.firstTouchLeads).toBe(1);
		expect(performance.lastTouchLeads).toBe(1);
		expect(performance.bookings).toBe(1);
		expect(performance.closedRevenueCents).toBe(940_000);
		expect(performance.unconvertedDeals).toBe(0);
	});

	it("reports no measurement for a campaign without a UTM key", async () => {
		const performance = await attribution.performanceForUtmCampaign(null);
		expect(performance.measured).toBe(false);
		expect(performance.closedRevenueCents).toBeNull();
	});

	it("groups the source breakdown by first touch", async () => {
		const breakdown = await attribution.sourceBreakdown();
		const row = breakdown.rows.find(
			(entry) => entry.source === "facebook" && entry.medium === "cpc",
		);
		expect(row).toBeDefined();
	});
});
