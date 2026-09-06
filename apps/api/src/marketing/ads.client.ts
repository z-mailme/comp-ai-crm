import { Injectable } from "@nestjs/common";
import { z } from "zod";

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

export type AdsCampaign = {
	id: string;
	name: string;
	status: string;
	type: string | null;
	budgetMicros: number | null;
	spendMicros: number | null;
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	cpcMicros: number | null;
	conversions: number | null;
	conversionValue: number | null;
	cpaMicros: number | null;
	roas: number | null;
	children: { id: string; name: string; status: string; type: string }[];
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

const googleSearchResponse = z.array(
	z.object({
		results: z.array(googleCampaignRow).optional(),
	}),
);

const metaCampaign = z.object({
	id: z.string(),
	name: z.string().optional(),
	status: z.string().optional(),
	effective_status: z.string().optional(),
	objective: z.string().optional(),
	daily_budget: z.string().or(z.number()).nullable().optional(),
	lifetime_budget: z.string().or(z.number()).nullable().optional(),
	insights: z
		.object({
			data: z.array(
				z.object({
					spend: z.string().or(z.number()).optional(),
					impressions: z.string().or(z.number()).optional(),
					clicks: z.string().or(z.number()).optional(),
					ctr: z.string().or(z.number()).optional(),
					cpc: z.string().or(z.number()).optional(),
					actions: z
						.array(
							z.object({
								action_type: z.string(),
								value: z.string().or(z.number()),
							}),
						)
						.optional(),
					action_values: z
						.array(
							z.object({
								action_type: z.string(),
								value: z.string().or(z.number()),
							}),
						)
						.optional(),
				}),
			),
		})
		.optional(),
});

const metaCampaignsResponse = z.object({
	data: z.array(metaCampaign).default([]),
});

@Injectable()
export class AdsClient {
	async googleCampaigns(config: GoogleAdsConfig): Promise<AdsCampaign[]> {
		const query = [
			"SELECT",
			"campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,",
			"campaign_budget.amount_micros,",
			"metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,",
			"metrics.average_cpc, metrics.conversions, metrics.conversions_value,",
			"metrics.cost_per_conversion",
			"FROM campaign",
			"WHERE segments.date DURING LAST_30_DAYS",
			"ORDER BY metrics.cost_micros DESC",
			"LIMIT 50",
		].join(" ");

		const headers: Record<string, string> = {
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

		const parsed = googleSearchResponse.parse(await response.json());
		return parsed
			.flatMap((chunk) => chunk.results ?? [])
			.map((row) => {
				const spend = numberOf(row.metrics?.costMicros);
				const conversions = row.metrics?.conversions ?? null;
				const conversionValue = row.metrics?.conversionsValue ?? null;

				return {
					id: String(row.campaign.id ?? ""),
					name: row.campaign.name ?? "Untitled campaign",
					status: row.campaign.status ?? "UNKNOWN",
					type: row.campaign.advertisingChannelType ?? null,
					budgetMicros: numberOf(row.campaignBudget?.amountMicros),
					spendMicros: spend,
					impressions: numberOf(row.metrics?.impressions),
					clicks: numberOf(row.metrics?.clicks),
					ctr: row.metrics?.ctr ?? null,
					cpcMicros: numberOf(row.metrics?.averageCpc),
					conversions,
					conversionValue,
					cpaMicros: numberOf(row.metrics?.costPerConversion),
					roas:
						spend && conversionValue
							? conversionValue / (spend / 1_000_000)
							: null,
					children: [],
				};
			});
	}

	async metaCampaigns(config: MetaAdsConfig): Promise<AdsCampaign[]> {
		const account = config.adAccountId.startsWith("act_")
			? config.adAccountId
			: `act_${config.adAccountId}`;
		const fields = [
			"id",
			"name",
			"status",
			"effective_status",
			"objective",
			"daily_budget",
			"lifetime_budget",
			"insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values}",
		].join(",");
		const url = new URL(
			`https://graph.facebook.com/${config.graphVersion}/${account}/campaigns`,
		);
		url.searchParams.set("fields", fields);
		url.searchParams.set("limit", "50");
		url.searchParams.set("access_token", config.accessToken);

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Meta Ads returned HTTP ${response.status}.`);
		}

		const parsed = metaCampaignsResponse.parse(await response.json());
		return parsed.data.map((campaign) => {
			const insight = campaign.insights?.data[0];
			const spend = currencyToMicros(insight?.spend);
			const conversions = actionValue(insight?.actions, "lead");
			const conversionValue =
				actionValue(insight?.action_values, "purchase") ??
				actionValue(insight?.action_values, "omni_purchase");

			return {
				id: campaign.id,
				name: campaign.name ?? "Untitled campaign",
				status: campaign.effective_status ?? campaign.status ?? "UNKNOWN",
				type: campaign.objective ?? null,
				budgetMicros:
					currencyToMicros(campaign.daily_budget) ??
					currencyToMicros(campaign.lifetime_budget),
				spendMicros: spend,
				impressions: numberOf(insight?.impressions),
				clicks: numberOf(insight?.clicks),
				ctr: numberOf(insight?.ctr),
				cpcMicros: currencyToMicros(insight?.cpc),
				conversions,
				conversionValue,
				cpaMicros:
					spend && conversions ? Math.round(spend / conversions) : null,
				roas:
					spend && conversionValue
						? conversionValue / (spend / 1_000_000)
						: null,
				children: [],
			};
		});
	}
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
	actions:
		| {
				action_type: string;
				value: string | number;
		  }[]
		| undefined,
	name: string,
): number | null {
	const action = actions?.find((row) => row.action_type === name);
	return numberOf(action?.value);
}
