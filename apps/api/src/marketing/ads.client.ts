import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { MARKETING_ADS } from "./marketing-config";

export type GoogleAdsConfig = {
	customerId: string;
	accessToken: string;
	developerToken: string;
	loginCustomerId?: string;
};

export type MetaAdsConfig = {
	adAccountId: string;
	accessToken: string;
	graphVersion: string;
};

export type AdsMetricValues = {
	spendMicros: number | null;
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	cpcMicros: number | null;
	conversions: number | null;
	conversionValue: number | null;
	cpaMicros: number | null;
	roas: number | null;
	reach: number | null;
	cpmMicros: number | null;
	costPerResultMicros: number | null;
};

export type AdsAd = AdsMetricValues & {
	id: string;
	name: string;
	status: string;
	type: string | null;
};

export type AdsChild = AdsAd & {
	children: AdsAd[];
};

export type AdsCampaign = AdsMetricValues & {
	id: string;
	name: string;
	status: string;
	type: string | null;
	budgetMicros: number | null;
	children: AdsChild[];
};

export type AdsSearchTerm = {
	term: string;
	campaignId: string;
	campaignName: string;
	adGroupId: string | null;
	adGroupName: string | null;
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	costMicros: number | null;
	conversions: number | null;
};

const googleCampaignRow = z.object({
	campaign: z.object({
		id: z.string().or(z.number()).optional(),
		name: z.string().optional(),
		status: z.string().optional(),
		advertisingChannelType: z.string().optional(),
	}),
	campaignBudget: z
		.object({
			amountMicros: z.string().or(z.number()).optional(),
		})
		.optional(),
	metrics: z
		.object({
			costMicros: z.string().or(z.number()).optional(),
			impressions: z.string().or(z.number()).optional(),
			clicks: z.string().or(z.number()).optional(),
			ctr: z.number().optional(),
			averageCpc: z.string().or(z.number()).optional(),
			conversions: z.number().optional(),
			conversionsValue: z.number().optional(),
			costPerConversion: z.string().or(z.number()).optional(),
		})
		.optional(),
});

const googleAdGroupRow = z.object({
	adGroup: z.object({
		id: z.string().or(z.number()).optional(),
		name: z.string().optional(),
		status: z.string().optional(),
		type: z.string().optional(),
	}),
	campaign: z.object({
		id: z.string().or(z.number()).optional(),
	}),
	metrics: googleCampaignRow.shape.metrics,
});

const googleSearchTermRow = z.object({
	searchTermView: z.object({
		searchTerm: z.string().optional(),
	}),
	campaign: z.object({
		id: z.string().or(z.number()).optional(),
		name: z.string().optional(),
	}),
	adGroup: z
		.object({
			id: z.string().or(z.number()).optional(),
			name: z.string().optional(),
		})
		.optional(),
	metrics: googleCampaignRow.shape.metrics,
});

const googleSearchChunks = z.array(
	z.object({
		results: z.array(z.unknown()).optional(),
	}),
);

const metaAction = z.object({
	action_type: z.string(),
	value: z.string().or(z.number()),
});

const metaInsightRow = z.object({
	spend: z.string().or(z.number()).optional(),
	impressions: z.string().or(z.number()).optional(),
	clicks: z.string().or(z.number()).optional(),
	ctr: z.string().or(z.number()).optional(),
	cpc: z.string().or(z.number()).optional(),
	cpm: z.string().or(z.number()).optional(),
	reach: z.string().or(z.number()).optional(),
	actions: z.array(metaAction).optional(),
	action_values: z.array(metaAction).optional(),
	cost_per_action_type: z.array(metaAction).optional(),
});

type MetaInsightRow = z.infer<typeof metaInsightRow>;

const metaInsights = z
	.object({
		data: z.array(metaInsightRow),
	})
	.optional();

const metaEntity = z.object({
	id: z.string(),
	name: z.string().optional(),
	status: z.string().optional(),
	effective_status: z.string().optional(),
	objective: z.string().optional(),
	daily_budget: z.string().or(z.number()).nullable().optional(),
	lifetime_budget: z.string().or(z.number()).nullable().optional(),
	campaign_id: z.string().optional(),
	adset_id: z.string().optional(),
	insights: metaInsights,
});

const metaPage = z.object({
	data: z.array(metaEntity).default([]),
	paging: z
		.object({
			next: z.string().optional(),
		})
		.optional(),
});

type GoogleSearchChunks = z.input<typeof googleSearchChunks>;

type MetaEntityInput = z.input<typeof metaEntity>;

export function mapGoogleCampaigns(chunks: GoogleSearchChunks): AdsCampaign[] {
	return googleRows(chunks, googleCampaignRow).map((row) => {
		const metrics = mapGoogleMetrics(row.metrics);
		return {
			...metrics,
			id: String(row.campaign.id ?? ""),
			name: row.campaign.name ?? "Untitled campaign",
			status: row.campaign.status ?? "UNKNOWN",
			type: row.campaign.advertisingChannelType ?? null,
			budgetMicros: numberOf(row.campaignBudget?.amountMicros),
			children: [],
		};
	});
}

export function mapGoogleAdGroups(
	chunks: GoogleSearchChunks,
): Map<string, AdsChild[]> {
	const groups = new Map<string, AdsChild[]>();
	for (const row of googleRows(chunks, googleAdGroupRow)) {
		const campaignId = String(row.campaign.id ?? "");
		if (!campaignId) continue;
		const list = groups.get(campaignId) ?? [];
		list.push({
			...mapGoogleMetrics(row.metrics),
			id: String(row.adGroup.id ?? ""),
			name: row.adGroup.name ?? "Untitled ad group",
			status: row.adGroup.status ?? "UNKNOWN",
			type: row.adGroup.type ?? null,
			children: [],
		});
		groups.set(campaignId, list);
	}
	return groups;
}

export function mapGoogleSearchTerms(
	chunks: GoogleSearchChunks,
): AdsSearchTerm[] {
	return googleRows(chunks, googleSearchTermRow).map((row) => ({
		term: row.searchTermView.searchTerm ?? "Unknown term",
		campaignId: String(row.campaign.id ?? ""),
		campaignName: row.campaign.name ?? "Untitled campaign",
		adGroupId: row.adGroup?.id ? String(row.adGroup.id) : null,
		adGroupName: row.adGroup?.name ?? null,
		impressions: numberOf(row.metrics?.impressions),
		clicks: numberOf(row.metrics?.clicks),
		ctr: row.metrics?.ctr ?? null,
		costMicros: numberOf(row.metrics?.costMicros),
		conversions: row.metrics?.conversions ?? null,
	}));
}

export function mapMetaCampaigns(rows: MetaEntityInput[]): AdsCampaign[] {
	return z
		.array(metaEntity)
		.parse(rows)
		.map((entity) => ({
			...mapMetaMetrics(entity.insights?.data[0]),
			id: entity.id,
			name: entity.name ?? "Untitled campaign",
			status: entity.effective_status ?? entity.status ?? "UNKNOWN",
			type: entity.objective ?? null,
			budgetMicros:
				currencyToMicros(entity.daily_budget) ??
				currencyToMicros(entity.lifetime_budget),
			children: [],
		}));
}

export function mapMetaAdSets(
	rows: MetaEntityInput[],
): Map<string, AdsChild[]> {
	const groups = new Map<string, AdsChild[]>();
	for (const entity of z.array(metaEntity).parse(rows)) {
		if (!entity.campaign_id) continue;
		const list = groups.get(entity.campaign_id) ?? [];
		list.push({
			...mapMetaMetrics(entity.insights?.data[0]),
			id: entity.id,
			name: entity.name ?? "Untitled ad set",
			status: entity.effective_status ?? entity.status ?? "UNKNOWN",
			type: null,
			children: [],
		});
		groups.set(entity.campaign_id, list);
	}
	return groups;
}

export function mapMetaAds(rows: MetaEntityInput[]): Map<string, AdsAd[]> {
	const groups = new Map<string, AdsAd[]>();
	for (const entity of z.array(metaEntity).parse(rows)) {
		if (!entity.adset_id) continue;
		const list = groups.get(entity.adset_id) ?? [];
		list.push({
			...mapMetaMetrics(entity.insights?.data[0]),
			id: entity.id,
			name: entity.name ?? "Untitled ad",
			status: entity.effective_status ?? entity.status ?? "UNKNOWN",
			type: null,
		});
		groups.set(entity.adset_id, list);
	}
	return groups;
}

@Injectable()
export class AdsClient {
	async googleCampaigns(config: GoogleAdsConfig): Promise<AdsCampaign[]> {
		const chunks = await this.googleQuery(
			config,
			[
				"SELECT",
				"campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,",
				"campaign_budget.amount_micros,",
				"metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,",
				"metrics.average_cpc, metrics.conversions, metrics.conversions_value,",
				"metrics.cost_per_conversion",
				"FROM campaign",
				"WHERE segments.date DURING LAST_30_DAYS",
				"ORDER BY metrics.cost_micros DESC",
				`LIMIT ${MARKETING_ADS.queryLimit}`,
			].join(" "),
		);
		return mapGoogleCampaigns(chunks);
	}

	async googleAdGroups(
		config: GoogleAdsConfig,
	): Promise<Map<string, AdsChild[]>> {
		const chunks = await this.googleQuery(
			config,
			[
				"SELECT",
				"ad_group.id, ad_group.name, ad_group.status, ad_group.type,",
				"campaign.id,",
				"metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,",
				"metrics.average_cpc, metrics.conversions, metrics.conversions_value,",
				"metrics.cost_per_conversion",
				"FROM ad_group",
				"WHERE segments.date DURING LAST_30_DAYS",
				"ORDER BY metrics.cost_micros DESC",
				`LIMIT ${MARKETING_ADS.queryLimit}`,
			].join(" "),
		);
		return mapGoogleAdGroups(chunks);
	}

	async googleSearchTerms(config: GoogleAdsConfig): Promise<AdsSearchTerm[]> {
		const chunks = await this.googleQuery(
			config,
			[
				"SELECT",
				"search_term_view.search_term,",
				"campaign.id, campaign.name,",
				"ad_group.id, ad_group.name,",
				"metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,",
				"metrics.conversions",
				"FROM search_term_view",
				"WHERE segments.date DURING LAST_30_DAYS",
				"ORDER BY metrics.impressions DESC",
				`LIMIT ${MARKETING_ADS.queryLimit}`,
			].join(" "),
		);
		return mapGoogleSearchTerms(chunks);
	}

	async metaCampaigns(config: MetaAdsConfig): Promise<AdsCampaign[]> {
		const rows = await this.metaCollection(config, "campaigns", [
			"id",
			"name",
			"status",
			"effective_status",
			"objective",
			"daily_budget",
			"lifetime_budget",
			metaInsightFields(),
		]);
		return mapMetaCampaigns(rows);
	}

	async metaAdSets(config: MetaAdsConfig): Promise<Map<string, AdsChild[]>> {
		const rows = await this.metaCollection(config, "adsets", [
			"id",
			"name",
			"status",
			"effective_status",
			"campaign_id",
			"daily_budget",
			"lifetime_budget",
			metaInsightFields(),
		]);
		return mapMetaAdSets(rows);
	}

	async metaAds(config: MetaAdsConfig): Promise<Map<string, AdsAd[]>> {
		const rows = await this.metaCollection(config, "ads", [
			"id",
			"name",
			"status",
			"effective_status",
			"adset_id",
			metaInsightFields(),
		]);
		return mapMetaAds(rows);
	}

	private async googleQuery(
		config: GoogleAdsConfig,
		query: string,
	): Promise<GoogleSearchChunks> {
		type GoogleAdsHeaders = {
			authorization: string;
			"developer-token": string;
			"content-type": string;
			"login-customer-id"?: string;
		};

		const headers: GoogleAdsHeaders = {
			authorization: `Bearer ${config.accessToken}`,
			"developer-token": config.developerToken,
			"content-type": "application/json",
		};
		if (config.loginCustomerId) {
			headers["login-customer-id"] = config.loginCustomerId;
		}

		const response = await fetch(
			`https://googleads.googleapis.com/v25/customers/${config.customerId}/googleAds:searchStream`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ query }),
			},
		);

		if (!response.ok) {
			throw new Error(`Google Ads returned HTTP ${response.status}.`);
		}

		return googleSearchChunks.parse(await response.json());
	}

	private async metaCollection(
		config: MetaAdsConfig,
		edge: string,
		fields: string[],
	): Promise<z.infer<typeof metaEntity>[]> {
		const account = config.adAccountId.startsWith("act_")
			? config.adAccountId
			: `act_${config.adAccountId}`;
		const url = new URL(
			`https://graph.facebook.com/${config.graphVersion}/${account}/${edge}`,
		);
		url.searchParams.set("fields", fields.join(","));
		url.searchParams.set("limit", String(MARKETING_ADS.queryLimit));
		url.searchParams.set("access_token", config.accessToken);

		const rows: z.infer<typeof metaEntity>[] = [];
		let next: string | null = url.toString();
		let pages = 0;
		while (next && pages < MARKETING_ADS.metaMaxPages) {
			const response = await fetch(next);
			if (!response.ok) {
				throw new Error(`Meta Ads returned HTTP ${response.status}.`);
			}
			const page = metaPage.parse(await response.json());
			rows.push(...page.data);
			pages += 1;
			next = page.paging?.next ?? null;
		}
		return rows;
	}
}

function metaInsightFields(): string {
	return "insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values,cost_per_action_type}";
}

function googleRows<T extends z.ZodType>(
	chunks: GoogleSearchChunks,
	row: T,
): z.infer<T>[] {
	return googleSearchChunks
		.parse(chunks)
		.flatMap((chunk) => chunk.results ?? [])
		.map((value) => row.parse(value));
}

function mapGoogleMetrics(
	metrics: z.infer<typeof googleCampaignRow>["metrics"],
): AdsMetricValues {
	const spend = numberOf(metrics?.costMicros);
	const conversions = metrics?.conversions ?? null;
	const conversionValue = metrics?.conversionsValue ?? null;
	return {
		spendMicros: spend,
		impressions: numberOf(metrics?.impressions),
		clicks: numberOf(metrics?.clicks),
		ctr: metrics?.ctr ?? null,
		cpcMicros: numberOf(metrics?.averageCpc),
		conversions,
		conversionValue,
		cpaMicros: numberOf(metrics?.costPerConversion),
		roas: roasOf(spend, conversionValue),
		reach: null,
		cpmMicros: null,
		costPerResultMicros: null,
	};
}

function mapMetaMetrics(insight: MetaInsightRow | undefined): AdsMetricValues {
	const spend = currencyToMicros(insight?.spend);
	const conversions = actionValue(insight?.actions, "lead");
	const conversionValue =
		actionValue(insight?.action_values, "purchase") ??
		actionValue(insight?.action_values, "omni_purchase");
	const ctr = numberOf(insight?.ctr);
	return {
		spendMicros: spend,
		impressions: numberOf(insight?.impressions),
		clicks: numberOf(insight?.clicks),
		ctr: ctr === null ? null : ctr / 100,
		cpcMicros: currencyToMicros(insight?.cpc),
		conversions,
		conversionValue,
		cpaMicros: spend && conversions ? Math.round(spend / conversions) : null,
		roas: roasOf(spend, conversionValue),
		reach: numberOf(insight?.reach),
		cpmMicros: currencyToMicros(insight?.cpm),
		costPerResultMicros: currencyToMicros(
			actionValue(insight?.cost_per_action_type, "lead"),
		),
	};
}

function roasOf(
	spendMicros: number | null,
	conversionValue: number | null,
): number | null {
	return spendMicros && conversionValue
		? conversionValue / (spendMicros / 1_000_000)
		: null;
}

function numberOf(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const next = Number(value);
	return Number.isFinite(next) ? next : null;
}

function currencyToMicros(
	value: string | number | null | undefined,
): number | null {
	const amount = numberOf(value);
	return amount === null ? null : Math.round(amount * 1_000_000);
}

function actionValue(
	actions: { action_type: string; value: string | number }[] | undefined,
	name: string,
): number | null {
	const action = actions?.find((row) => row.action_type === name);
	return numberOf(action?.value);
}
