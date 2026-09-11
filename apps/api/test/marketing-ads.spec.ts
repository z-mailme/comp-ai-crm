import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	db,
	MarketingIntegrationStatus,
	MarketingProvider,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	AdsClient,
	type MetaAdsConfig,
	mapGoogleAdGroups,
	mapGoogleCampaigns,
	mapGoogleSearchTerms,
	mapMetaAdSets,
	mapMetaAds,
	mapMetaCampaigns,
} from "../src/marketing/ads.client";
import { MarketingService } from "../src/marketing/marketing.service";

const marker = `marketing-ads-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;

const context = { userId, businessUnitId: unitId };

const GOOGLE_CHUNKS = [
	{
		results: [
			{
				campaign: {
					id: 101,
					name: "Search — Weddings",
					status: "ENABLED",
					advertisingChannelType: "SEARCH",
				},
				campaignBudget: { amountMicros: "50000000" },
				metrics: {
					costMicros: "12000000",
					impressions: "4000",
					clicks: "200",
					ctr: 0.05,
					averageCpc: "60000",
					conversions: 8,
					conversionsValue: 480,
					costPerConversion: "1500000",
				},
			},
		],
	},
	{
		results: [
			{
				campaign: {
					id: 102,
					name: "PMax — Corporate",
					status: "PAUSED",
					advertisingChannelType: "PERFORMANCE_MAX",
				},
				metrics: {
					costMicros: "3000000",
					impressions: "900",
					clicks: "30",
					ctr: 0.033,
					conversions: 1,
					conversionsValue: 60,
				},
			},
		],
	},
];

const GOOGLE_AD_GROUP_CHUNKS = [
	{
		results: [
			{
				adGroup: {
					id: 201,
					name: "Wedding booth",
					status: "ENABLED",
					type: "SEARCH_STANDARD",
				},
				campaign: { id: 101 },
				metrics: {
					costMicros: "7000000",
					impressions: "2500",
					clicks: "120",
					conversions: 5,
				},
			},
			{
				adGroup: { id: 202, name: "Party booth", status: "ENABLED" },
				campaign: { id: 101 },
				metrics: { costMicros: "5000000", impressions: "1500", clicks: "80" },
			},
		],
	},
];

const GOOGLE_SEARCH_TERM_CHUNKS = [
	{
		results: [
			{
				searchTermView: { searchTerm: "360 photo booth hire leeds" },
				campaign: { id: 101, name: "Search — Weddings" },
				adGroup: { id: 201, name: "Wedding booth" },
				metrics: {
					impressions: "900",
					clicks: "45",
					ctr: 0.05,
					costMicros: "2700000",
					conversions: 3,
				},
			},
		],
	},
];

const META_CAMPAIGN_ROWS = [
	{
		id: "cmp_1",
		name: "Leads — Spring",
		status: "ACTIVE",
		effective_status: "ACTIVE",
		objective: "OUTCOME_LEADS",
		daily_budget: "2500",
		insights: {
			data: [
				{
					spend: "412.50",
					impressions: "30500",
					clicks: "610",
					ctr: "2.0",
					cpc: "0.676",
					cpm: "13.52",
					reach: "21000",
					actions: [{ action_type: "lead", value: "14" }],
					action_values: [{ action_type: "purchase", value: "980.00" }],
					cost_per_action_type: [{ action_type: "lead", value: "29.46" }],
				},
			],
		},
	},
];

const META_AD_SET_ROWS = [
	{
		id: "set_1",
		name: "Broad UK",
		effective_status: "ACTIVE",
		campaign_id: "cmp_1",
		insights: {
			data: [{ spend: "300.00", impressions: "20000", clicks: "400" }],
		},
	},
];

const META_AD_ROWS = [
	{
		id: "ad_1",
		name: "Video A",
		effective_status: "ACTIVE",
		adset_id: "set_1",
		insights: {
			data: [{ spend: "180.00", impressions: "12000", reach: "9000" }],
		},
	},
];

class FakeAdsClient {
	campaigns = mapGoogleCampaigns(GOOGLE_CHUNKS);
	adGroups = mapGoogleAdGroups(GOOGLE_AD_GROUP_CHUNKS);
	terms = mapGoogleSearchTerms(GOOGLE_SEARCH_TERM_CHUNKS);
	metaCampaignRows = mapMetaCampaigns(META_CAMPAIGN_ROWS);
	metaAdSetRows = mapMetaAdSets(META_AD_SET_ROWS);
	metaAdRows = mapMetaAds(META_AD_ROWS);
	calls = 0;
	fails = false;

	async googleCampaigns() {
		this.calls += 1;
		if (this.fails) throw new Error("Google Ads returned HTTP 401.");
		return this.campaigns.map((row) => ({ ...row, children: [] }));
	}

	async googleAdGroups() {
		this.calls += 1;
		if (this.fails) throw new Error("Google Ads returned HTTP 401.");
		return this.adGroups;
	}

	async googleSearchTerms() {
		this.calls += 1;
		if (this.fails) throw new Error("Google Ads returned HTTP 401.");
		return this.terms;
	}

	async metaCampaigns() {
		this.calls += 1;
		if (this.fails) throw new Error("Meta Ads returned HTTP 400.");
		return this.metaCampaignRows.map((row) => ({ ...row, children: [] }));
	}

	async metaAdSets() {
		this.calls += 1;
		if (this.fails) throw new Error("Meta Ads returned HTTP 400.");
		return this.metaAdSetRows;
	}

	async metaAds() {
		this.calls += 1;
		if (this.fails) throw new Error("Meta Ads returned HTTP 400.");
		return this.metaAdRows;
	}
}

const ads = new FakeAdsClient();
const service = new MarketingService(
	db,
	{} as never,
	ads as never,
	{} as never,
);

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
			name: "Ads Tester",
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
			name: `Ads Unit ${marker}`,
			slug: `ads-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.marketingIntegration.create({
		data: {
			businessUnitId: unitId,
			provider: MarketingProvider.GOOGLE_ADS,
			label: "Google Ads",
			status: MarketingIntegrationStatus.CONNECTED,
			config: { customerId: "1234567890" },
			secrets: { accessToken: "token", developerToken: "dev-token" },
			createdById: userId,
		},
	});
	await db.marketingIntegration.create({
		data: {
			businessUnitId: unitId,
			provider: MarketingProvider.META_ADS,
			label: "Meta Ads",
			status: MarketingIntegrationStatus.CONNECTED,
			config: { adAccountId: "act_55", graphVersion: "v24.0" },
			secrets: { accessToken: "token" },
			createdById: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.marketingAdsSnapshot.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.marketingIntegration.deleteMany({
		where: { businessUnitId: unitId },
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

describe("google ads mappers", () => {
	it("maps campaign rows across streamed chunks and computes roas", () => {
		const campaigns = mapGoogleCampaigns(GOOGLE_CHUNKS);
		expect(campaigns).toHaveLength(2);

		const first = campaigns[0];
		expect(first?.id).toBe("101");
		expect(first?.type).toBe("SEARCH");
		expect(first?.budgetMicros).toBe(50_000_000);
		expect(first?.spendMicros).toBe(12_000_000);
		expect(first?.ctr).toBe(0.05);
		expect(first?.conversions).toBe(8);
		expect(first?.cpaMicros).toBe(1_500_000);
		expect(first?.roas).toBeCloseTo(40, 5);

		const second = campaigns[1];
		expect(second?.cpaMicros).toBeNull();
		expect(second?.roas).toBeCloseTo(20, 5);
	});

	it("nests ad groups under their campaign id", () => {
		const groups = mapGoogleAdGroups(GOOGLE_AD_GROUP_CHUNKS);
		const children = groups.get("101");
		expect(children).toHaveLength(2);
		expect(children?.[0]?.name).toBe("Wedding booth");
		expect(children?.[0]?.spendMicros).toBe(7_000_000);
		expect(children?.[0]?.children).toEqual([]);
	});

	it("maps search term rows with campaign and ad group context", () => {
		const terms = mapGoogleSearchTerms(GOOGLE_SEARCH_TERM_CHUNKS);
		expect(terms).toHaveLength(1);
		expect(terms[0]?.term).toBe("360 photo booth hire leeds");
		expect(terms[0]?.campaignName).toBe("Search — Weddings");
		expect(terms[0]?.adGroupName).toBe("Wedding booth");
		expect(terms[0]?.costMicros).toBe(2_700_000);
	});
});

describe("meta ads mappers", () => {
	it("maps campaigns with reach, cpm and cost per result", () => {
		const campaigns = mapMetaCampaigns(META_CAMPAIGN_ROWS);
		expect(campaigns).toHaveLength(1);

		const campaign = campaigns[0];
		expect(campaign?.budgetMicros).toBe(2_500_000_000);
		expect(campaign?.spendMicros).toBe(412_500_000);
		expect(campaign?.reach).toBe(21_000);
		expect(campaign?.ctr).toBeCloseTo(0.02, 5);
		expect(campaign?.cpmMicros).toBe(13_520_000);
		expect(campaign?.conversions).toBe(14);
		expect(campaign?.costPerResultMicros).toBe(29_460_000);
		expect(campaign?.conversionValue).toBe(980);
		expect(campaign?.roas).toBeCloseTo(2.3758, 3);
	});

	it("nests ad sets under campaigns and ads under ad sets", () => {
		const adSets = mapMetaAdSets(META_AD_SET_ROWS);
		const adsBySet = mapMetaAds(META_AD_ROWS);

		const children = adSets.get("cmp_1");
		expect(children).toHaveLength(1);
		expect(children?.[0]?.name).toBe("Broad UK");

		const ads = adsBySet.get("set_1");
		expect(ads).toHaveLength(1);
		expect(ads?.[0]?.name).toBe("Video A");
		expect(ads?.[0]?.reach).toBe(9_000);
	});

	it("follows paging.next and merges meta pages", async () => {
		const originalFetch = globalThis.fetch;
		const requested: string[] = [];
		const pages = [
			{
				data: META_CAMPAIGN_ROWS,
				paging: {
					next: "https://graph.facebook.com/v24.0/act_55/campaigns?after=2",
				},
			},
			{ data: META_AD_SET_ROWS },
		];
		let calls = 0;
		globalThis.fetch = (async (input: string | URL | Request) => {
			requested.push(String(input));
			const page = pages[calls];
			calls += 1;
			return {
				ok: true,
				json: async () => page,
			} as Response;
		}) as typeof fetch;

		try {
			const client = new AdsClient();
			const config: MetaAdsConfig = {
				adAccountId: "act_55",
				accessToken: "token",
				graphVersion: "v24.0",
			};
			const campaigns = await client.metaCampaigns(config);
			expect(calls).toBe(2);
			expect(requested[0]).toContain("/act_55/campaigns");
			expect(requested[1]).toContain("after=2");
			expect(campaigns).toHaveLength(2);
			expect(campaigns.map((row) => row.id)).toEqual(["cmp_1", "set_1"]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("marketing ads snapshots", () => {
	it("reads the workspace from the snapshot without calling the provider", async () => {
		await db.marketingAdsSnapshot.create({
			data: {
				businessUnitId: unitId,
				provider: MarketingProvider.GOOGLE_ADS,
				kind: "campaigns",
				payload: {
					campaigns: mapGoogleCampaigns(GOOGLE_CHUNKS),
					searchTerms: mapGoogleSearchTerms(GOOGLE_SEARCH_TERM_CHUNKS),
				},
			},
		});

		const callsBefore = ads.calls;
		const workspace = await service.googleAds(context, {});
		expect(ads.calls).toBe(callsBefore);
		expect(workspace.campaigns).toHaveLength(2);
		expect(workspace.searchTerms).toHaveLength(1);
		expect(workspace.syncedAt).not.toBeNull();
		expect(workspace.error).toBeNull();

		const spend = workspace.metrics.find((row) => row.label === "Spend");
		expect(spend?.value).toBe(15_000_000);
	});

	it("syncs google ads into a snapshot and marks the integration healthy", async () => {
		const result = await service.syncAds(context, {
			provider: MarketingProvider.GOOGLE_ADS,
		});
		expect(result.synced).toBe(true);
		expect(result.campaigns).toBe(2);
		expect(result.error).toBeNull();

		const snapshot = await db.marketingAdsSnapshot.findUnique({
			where: {
				businessUnitId_provider_kind: {
					businessUnitId: unitId,
					provider: MarketingProvider.GOOGLE_ADS,
					kind: "campaigns",
				},
			},
		});
		expect(snapshot?.error).toBeNull();

		const workspace = await service.googleAds(context, {});
		expect(workspace.campaigns[0]?.children).toHaveLength(2);
		expect(workspace.campaigns[0]?.children[0]?.name).toBe("Wedding booth");

		const integration = await db.marketingIntegration.findUnique({
			where: {
				businessUnitId_provider: {
					businessUnitId: unitId,
					provider: MarketingProvider.GOOGLE_ADS,
				},
			},
		});
		expect(integration?.status).toBe(MarketingIntegrationStatus.CONNECTED);
		expect(integration?.lastError).toBeNull();
	});

	it("syncs meta ads with nested ad sets and ads", async () => {
		const result = await service.syncAds(context, {
			provider: MarketingProvider.META_ADS,
		});
		expect(result.synced).toBe(true);

		const workspace = await service.metaAds(context, {});
		expect(workspace.searchTerms).toEqual([]);
		const campaign = workspace.campaigns[0];
		expect(campaign?.children).toHaveLength(1);
		expect(campaign?.children[0]?.children).toHaveLength(1);
		expect(campaign?.children[0]?.children[0]?.name).toBe("Video A");
		expect(campaign?.reach).toBe(21_000);
	});

	it("records provider errors on the snapshot and flags the integration", async () => {
		ads.fails = true;
		try {
			const result = await service.syncAds(context, {
				provider: MarketingProvider.GOOGLE_ADS,
			});
			expect(result.synced).toBe(false);
			expect(result.error).toContain("401");

			const snapshot = await db.marketingAdsSnapshot.findUnique({
				where: {
					businessUnitId_provider_kind: {
						businessUnitId: unitId,
						provider: MarketingProvider.GOOGLE_ADS,
						kind: "campaigns",
					},
				},
			});
			expect(snapshot?.error).toContain("401");

			const integration = await db.marketingIntegration.findUnique({
				where: {
					businessUnitId_provider: {
						businessUnitId: unitId,
						provider: MarketingProvider.GOOGLE_ADS,
					},
				},
			});
			expect(integration?.status).toBe(
				MarketingIntegrationStatus.NEEDS_ATTENTION,
			);

			const workspace = await service.googleAds(context, {});
			expect(workspace.error).toContain("401");
			expect(workspace.campaigns.length).toBeGreaterThan(0);
		} finally {
			ads.fails = false;
		}
	});
});
