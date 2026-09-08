import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ApprovalRiskLevel,
	BusinessEventSource,
	BusinessUnitStatus,
	CommunicationChannel,
	CustomerIdentityKind,
	CustomerIdentityStatus,
	db,
	GoogleSyncStatus,
	MarketingIntegrationStatus,
	MarketingProvider,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { BusinessOsService } from "../src/business-os/business-os.service";
import { ConversionService } from "../src/currency/conversion.service";
import { MarketingService } from "../src/marketing/marketing.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `business-os-visible-${suffix}`;
const userId = `user-${marker}`;
const unitAId = `unit-a-${marker}`;
const unitBId = `unit-b-${marker}`;
const contactAId = `contact-a-${marker}`;
const contactBId = `contact-b-${marker}`;
const calendarService = new BusinessOsService(db, new ConversionService(db));
let listmonk: FakeListmonkClient;
let ads: FakeAdsClient;
let marketingService: MarketingService;

beforeAll(async () => {
	listmonk = new FakeListmonkClient();
	ads = new FakeAdsClient();
	marketingService = new MarketingService(db, listmonk as never, ads as never);
	await clean();
	await seedWorkspace();
});

afterAll(async () => {
	await clean();
});

describe("Business OS visible workspaces", () => {
	it("reads calendar events from the selected BusinessUnit only", async () => {
		await db.mailboxSync.upsert({
			where: { userId_source: { userId, source: "calendar" } },
			create: {
				userId,
				source: "calendar",
				status: GoogleSyncStatus.IDLE,
				lastSyncedAt: new Date("2026-09-06T08:00:00.000Z"),
			},
			update: {},
		});
		await seedCalendarEvent({
			id: `calendar-a-${marker}`,
			businessUnitId: unitAId,
			title: `Board review ${marker}`,
			googleEventId: `google-a-${marker}`,
			startsAt: new Date("2026-09-06T09:00:00.000Z"),
		});
		await seedCalendarEvent({
			id: `calendar-b-${marker}`,
			businessUnitId: unitBId,
			title: `Vendor call ${marker}`,
			googleEventId: `google-b-${marker}`,
			startsAt: new Date("2026-09-06T11:00:00.000Z"),
		});

		const calendar = await calendarService.calendar(
			{ userId, businessUnitId: unitAId },
			{ view: "day", date: "2026-09-06", search: "" },
		);

		expect(calendar.connection.connected).toBe(true);
		expect(calendar.events.map((event) => event.id)).toEqual([
			`calendar-a-${marker}`,
		]);
		expect(JSON.stringify(calendar)).not.toContain(`Vendor call ${marker}`);
	});

	it("includes legacy unscoped calendar events when identities link them", async () => {
		await db.contact.createMany({
			data: [
				{
					id: contactAId,
					firstName: "Ari",
					email: `ari-${marker}@example.test`,
				},
				{
					id: contactBId,
					firstName: "Bryn",
					email: `bryn-${marker}@example.test`,
				},
			],
		});
		await db.customerIdentity.create({
			data: {
				businessUnitId: unitAId,
				contactId: contactAId,
				kind: CustomerIdentityKind.EMAIL,
				channel: CommunicationChannel.EMAIL,
				value: `ari-${marker}@example.test`,
				status: CustomerIdentityStatus.VERIFIED,
			},
		});
		await seedCalendarEvent({
			id: `calendar-legacy-linked-${marker}`,
			businessUnitId: null,
			contactId: contactAId,
			title: `Linked legacy event ${marker}`,
			googleEventId: `google-legacy-linked-${marker}`,
			startsAt: new Date("2026-09-07T09:00:00.000Z"),
		});
		await seedCalendarEvent({
			id: `calendar-legacy-unlinked-${marker}`,
			businessUnitId: null,
			contactId: contactBId,
			title: `Unlinked legacy event ${marker}`,
			googleEventId: `google-legacy-unlinked-${marker}`,
			startsAt: new Date("2026-09-07T10:00:00.000Z"),
		});

		const calendar = await calendarService.calendar(
			{ userId, businessUnitId: unitAId },
			{ view: "day", date: "2026-09-07", search: "" },
		);

		expect(calendar.events.map((event) => event.id)).toEqual([
			`calendar-legacy-linked-${marker}`,
		]);
		expect(JSON.stringify(calendar)).not.toContain(
			`Unlinked legacy event ${marker}`,
		);
	});

	it("redacts Listmonk secrets and isolates email marketing by BusinessUnit", async () => {
		await marketingService.connectListmonk(
			{ userId, businessUnitId: unitAId },
			{
				baseUrl: "https://mail-a.example.test",
				authMethod: "basic",
				username: "mail-a",
				password: "secret-password-a",
			},
		);
		await marketingService.connectListmonk(
			{ userId, businessUnitId: unitBId },
			{
				baseUrl: "https://mail-b.example.test",
				authMethod: "token",
				token: "secret-token-b",
			},
		);

		const email = await marketingService.email(
			{ userId, businessUnitId: unitAId },
			{},
		);

		expect(email.integration.baseUrl).toBe("https://mail-a.example.test");
		expect(email.integration.status).toBe(MarketingIntegrationStatus.CONNECTED);
		expect(email.campaigns.map((campaign) => campaign.name)).toEqual([
			`Launch ${marker}`,
		]);
		expect(JSON.stringify(email)).not.toContain("secret-password-a");
		expect(JSON.stringify(email)).not.toContain("secret-token-b");
		expect(listmonk.baseUrls).toEqual(["https://mail-a.example.test"]);
	});

	it("stores ads connections without exposing access tokens", async () => {
		const integration = await marketingService.connectAds(
			{ userId, businessUnitId: unitAId },
			{
				provider: MarketingProvider.GOOGLE_ADS,
				accountId: `customers-${marker}`,
				label: "Search account",
				accessToken: "google-access-token",
				developerToken: "google-developer-token",
			},
		);
		const workspace = await marketingService.googleAds(
			{ userId, businessUnitId: unitAId },
			{},
		);

		expect(integration.accountId).toBe(`customers-${marker}`);
		expect(JSON.stringify(integration)).not.toContain("google-access-token");
		expect(workspace.campaigns.map((campaign) => campaign.name)).toEqual([
			`Search ${marker}`,
		]);
		expect(JSON.stringify(workspace)).not.toContain("google-developer-token");
	});

	it("routes marketing actions through pending approvals", async () => {
		const approval = await marketingService.requestAction(
			{ userId, businessUnitId: unitAId },
			{
				provider: MarketingProvider.META_ADS,
				action: "campaign.pause",
				summary: `Pause campaign ${marker}`,
				payload: { campaignId: `campaign-${marker}` },
			},
		);
		const row = await db.approvalRequest.findUniqueOrThrow({
			where: { id: approval.id },
			select: {
				businessUnitId: true,
				riskLevel: true,
				proposedAction: true,
			},
		});
		const event = await db.businessEvent.findUniqueOrThrow({
			where: { idempotencyKey: `marketing:approval:${approval.id}` },
			select: {
				businessUnitId: true,
				source: true,
				type: true,
			},
		});

		expect(row.businessUnitId).toBe(unitAId);
		expect(row.riskLevel).toBe(ApprovalRiskLevel.HIGH);
		expect(JSON.stringify(row.proposedAction)).toContain(`campaign-${marker}`);
		expect(event).toEqual({
			businessUnitId: unitAId,
			source: BusinessEventSource.SYSTEM,
			type: "marketing.approval.requested",
		});
	});
});

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
	await db.user.create({
		data: {
			id: userId,
			name: "Business OS User",
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
	await db.businessUnit.createMany({
		data: [
			{
				id: unitAId,
				name: `Unit A ${marker}`,
				slug: `unit-a-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
			{
				id: unitBId,
				name: `Unit B ${marker}`,
				slug: `unit-b-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
		],
	});
}

async function seedCalendarEvent(input: {
	id: string;
	businessUnitId: string | null;
	contactId?: string;
	title: string;
	googleEventId: string;
	startsAt: Date;
}) {
	await db.calendarEvent.create({
		data: {
			id: input.id,
			iCalUid: `${input.id}@example.test`,
			originalStartTime: input.startsAt,
			startsAt: input.startsAt,
			endsAt: new Date(input.startsAt.getTime() + 60 * 60 * 1000),
			status: "confirmed",
			businessUnitId: input.businessUnitId,
			contactId: input.contactId,
			title: input.title,
			googleEventId: input.googleEventId,
			attendees: {
				create: [
					{
						email: `owner-${marker}@example.test`,
						name: "Owner",
						responseStatus: "accepted",
						isOrganizer: true,
					},
				],
			},
		},
	});
}

async function clean() {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { contains: marker } },
	});
	await db.approvalRequest.deleteMany({
		where: { summary: { contains: marker } },
	});
	await db.marketingIntegration.deleteMany({
		where: { businessUnitId: { in: [unitAId, unitBId] } },
	});
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { contains: marker } },
	});
	await db.mailboxSync.deleteMany({
		where: { userId, source: "calendar" },
	});
	await db.customerIdentity.deleteMany({
		where: { value: { contains: marker } },
	});
	await db.contact.deleteMany({
		where: { id: { in: [contactAId, contactBId] } },
	});
	await db.businessUnit.deleteMany({
		where: { id: { in: [unitAId, unitBId] } },
	});
	await db.member.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

class FakeListmonkClient {
	readonly baseUrls: string[] = [];

	async dashboard(config: { baseUrl: string }) {
		this.baseUrls.push(config.baseUrl);
		return {
			campaigns: [
				{
					id: 7,
					name: `Launch ${marker}`,
					subject: `Launch ${marker}`,
					status: "draft",
					type: "regular",
					sent: 10,
					views: 5,
					clicks: 2,
					bounces: 0,
					unsubscribes: 0,
				},
			],
			lists: [
				{
					id: 3,
					name: `Customers ${marker}`,
					type: "public",
					status: "enabled",
					subscriber_count: 42,
				},
			],
			templates: [
				{
					id: 4,
					name: `Newsletter ${marker}`,
					type: "campaign",
				},
			],
			subscriberTotal: 42,
		};
	}

	async createCampaign() {
		return { data: { id: 9, status: "draft" } };
	}

	async sendTest() {}
}

class FakeAdsClient {
	async googleCampaigns() {
		return [
			{
				id: `google-campaign-${marker}`,
				name: `Search ${marker}`,
				status: "ENABLED",
				type: "SEARCH",
				budgetMicros: 1_000_000,
				spendMicros: 500_000,
				impressions: 1000,
				clicks: 50,
				ctr: 0.05,
				cpcMicros: 10_000,
				conversions: 5,
				conversionValue: 25,
				cpaMicros: 100_000,
				roas: 50,
				children: [],
			},
		];
	}

	async metaCampaigns() {
		return [];
	}
}
