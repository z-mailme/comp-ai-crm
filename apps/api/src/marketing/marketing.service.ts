import {
	ApprovalRiskLevel,
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	MarketingIntegrationStatus,
	MarketingProvider,
	Prisma,
} from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import { type AdsCampaign, AdsClient } from "./ads.client";
import { ListmonkClient, type ListmonkConfig } from "./listmonk.client";
import type {
	AdsConnectionInput,
	AdsWorkspaceOutput,
	BusinessContextInput,
	CreateListmonkCampaignInput,
	EmailMarketingOutput,
	ListmonkConnectionInput,
	MarketingIntegrationOutput,
	MarketingOverviewOutput,
	RequestMarketingActionInput,
	SendListmonkTestInput,
} from "./marketing.contracts";

const listmonkConfig = z.object({
	baseUrl: z.string().url(),
	authMethod: z.enum(["basic", "token"]),
	username: z.string().optional(),
});

const listmonkSecrets = z.object({
	password: z.string().optional(),
	token: z.string().optional(),
});

const googleAdsConfig = z.object({
	customerId: z.string(),
	loginCustomerId: z.string().optional(),
});

const googleAdsSecrets = z.object({
	accessToken: z.string(),
	developerToken: z.string(),
});

const metaAdsConfig = z.object({
	adAccountId: z.string(),
	graphVersion: z.string().default("v24.0"),
});

const metaAdsSecrets = z.object({
	accessToken: z.string(),
});

@Injectable()
export class MarketingService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly listmonk: ListmonkClient,
		private readonly ads: AdsClient,
	) {}

	async overview(
		source: BusinessContextSource,
		input: BusinessContextInput,
	): Promise<MarketingOverviewOutput> {
		const contextInput = input ?? {};
		const [email, googleAds, metaAds, crm] = await Promise.all([
			this.email(source, contextInput),
			this.googleAds(source, contextInput),
			this.metaAds(source, contextInput),
			this.crm(source, contextInput),
		]);

		return {
			email,
			googleAds,
			metaAds,
			crm,
			attribution: {
				available: false,
				status:
					"Campaign attribution is not complete until leads, deals, bookings and payments share campaign IDs.",
			},
		};
	}

	async email(
		source: BusinessContextSource,
		input: BusinessContextInput,
	): Promise<EmailMarketingOutput> {
		const contextInput = input ?? {};
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, contextInput),
		);
		const integration = await this.integration(
			context.businessUnitId,
			MarketingProvider.LISTMONK,
		);
		if (!integration)
			return emptyEmail(notConfigured(MarketingProvider.LISTMONK));

		const summary = summarizeIntegration(integration);

		try {
			const config = listmonkConfig.parse(integration.config ?? {});
			const secrets = listmonkSecrets.parse(integration.secrets ?? {});
			const credentials: ListmonkConfig = { ...config, ...secrets };
			const data = await this.listmonk.dashboard(credentials);
			await this.markHealthy(integration.id);
			const campaigns = data.campaigns.map((campaign) => ({
				id: campaign.id,
				name: campaign.name,
				subject: campaign.subject ?? null,
				status: campaign.status,
				type: campaign.type ?? null,
				sent: campaign.sent ?? null,
				opens: campaign.views ?? null,
				clicks: campaign.clicks ?? null,
				bounces: campaign.bounces ?? null,
				unsubscribes: campaign.unsubscribes ?? null,
				createdAt: campaign.created_at ?? null,
				updatedAt: campaign.updated_at ?? null,
				startedAt: campaign.started_at ?? null,
			}));

			return {
				integration: summary,
				campaigns,
				lists: data.lists.map((list) => ({
					id: list.id,
					name: list.name,
					type: list.type,
					status: list.status,
					subscriberCount: list.subscriber_count ?? null,
				})),
				templates: data.templates.map((template) => ({
					id: template.id,
					name: template.name,
					type: template.type ?? null,
				})),
				subscribers: { total: data.subscriberTotal },
				metrics: emailMetrics(campaigns),
				error: null,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.markUnhealthy(integration.id, message);
			return emptyEmail(
				{ ...summary, status: MarketingIntegrationStatus.NEEDS_ATTENTION },
				message,
			);
		}
	}

	async googleAds(
		source: BusinessContextSource,
		input: BusinessContextInput,
	): Promise<AdsWorkspaceOutput> {
		return this.adsWorkspace(source, input, MarketingProvider.GOOGLE_ADS);
	}

	async metaAds(
		source: BusinessContextSource,
		input: BusinessContextInput,
	): Promise<AdsWorkspaceOutput> {
		return this.adsWorkspace(source, input, MarketingProvider.META_ADS);
	}

	async connectListmonk(
		source: BusinessContextSource,
		input: ListmonkConnectionInput,
	): Promise<MarketingIntegrationOutput> {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const label = hostnameOf(input.baseUrl) ?? "Listmonk";
		const row = await this.db.marketingIntegration.upsert({
			where: {
				businessUnitId_provider: {
					businessUnitId: context.businessUnitId,
					provider: MarketingProvider.LISTMONK,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				provider: MarketingProvider.LISTMONK,
				label,
				status: MarketingIntegrationStatus.CONNECTED,
				config: jsonObject({
					baseUrl: input.baseUrl,
					authMethod: input.authMethod,
					username: input.username,
				}),
				secrets: jsonObject({ password: input.password, token: input.token }),
				createdById: source.userId,
			},
			update: {
				label,
				status: MarketingIntegrationStatus.CONNECTED,
				config: jsonObject({
					baseUrl: input.baseUrl,
					authMethod: input.authMethod,
					username: input.username,
				}),
				secrets: jsonObject({ password: input.password, token: input.token }),
				lastError: null,
			},
			select: integrationSelect,
		});

		return summarizeIntegration(row);
	}

	async connectAds(
		source: BusinessContextSource,
		input: AdsConnectionInput,
	): Promise<MarketingIntegrationOutput> {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const provider = input.provider;
		const config =
			provider === MarketingProvider.GOOGLE_ADS
				? jsonObject({
						customerId: input.accountId,
						loginCustomerId: input.loginCustomerId,
					})
				: jsonObject({
						adAccountId: input.accountId,
						graphVersion: input.graphVersion ?? "v24.0",
					});
		const secrets =
			provider === MarketingProvider.GOOGLE_ADS
				? jsonObject({
						accessToken: input.accessToken,
						developerToken: input.developerToken,
					})
				: jsonObject({ accessToken: input.accessToken });

		const row = await this.db.marketingIntegration.upsert({
			where: {
				businessUnitId_provider: {
					businessUnitId: context.businessUnitId,
					provider,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				provider,
				label: input.label ?? labelFor(provider),
				status: MarketingIntegrationStatus.CONNECTED,
				config,
				secrets,
				createdById: source.userId,
			},
			update: {
				label: input.label ?? labelFor(provider),
				status: MarketingIntegrationStatus.CONNECTED,
				config,
				secrets,
				lastError: null,
			},
			select: integrationSelect,
		});

		return summarizeIntegration(row);
	}

	async disconnect(
		source: BusinessContextSource,
		input: { businessUnitId?: string; provider: MarketingProvider },
	): Promise<MarketingIntegrationOutput> {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const row = await this.db.marketingIntegration.upsert({
			where: {
				businessUnitId_provider: {
					businessUnitId: context.businessUnitId,
					provider: input.provider,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				provider: input.provider,
				label: labelFor(input.provider),
				status: MarketingIntegrationStatus.NOT_CONFIGURED,
				config: Prisma.DbNull,
				secrets: Prisma.DbNull,
				createdById: source.userId,
			},
			update: {
				status: MarketingIntegrationStatus.NOT_CONFIGURED,
				config: Prisma.DbNull,
				secrets: Prisma.DbNull,
				lastError: null,
			},
			select: integrationSelect,
		});

		return summarizeIntegration(row);
	}

	async createListmonkCampaign(
		source: BusinessContextSource,
		input: CreateListmonkCampaignInput,
	) {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const integration = await this.integration(
			context.businessUnitId,
			MarketingProvider.LISTMONK,
		);
		if (!integration)
			throw new BadRequestException("Listmonk is not connected.");
		const config = {
			...listmonkConfig.parse(integration.config ?? {}),
			...listmonkSecrets.parse(integration.secrets ?? {}),
		};
		const campaign = await this.listmonk.createCampaign(config, input);
		return {
			id: campaign.data.id,
			name: input.name,
			status: campaign.data.status ?? "created",
		};
	}

	async sendListmonkTest(
		source: BusinessContextSource,
		input: SendListmonkTestInput,
	) {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const integration = await this.integration(
			context.businessUnitId,
			MarketingProvider.LISTMONK,
		);
		if (!integration)
			throw new BadRequestException("Listmonk is not connected.");
		const config = {
			...listmonkConfig.parse(integration.config ?? {}),
			...listmonkSecrets.parse(integration.secrets ?? {}),
		};
		await this.listmonk.sendTest(config, input);
		return { ok: true };
	}

	async requestAction(
		source: BusinessContextSource,
		input: RequestMarketingActionInput,
	) {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const approval = await this.db.approvalRequest.create({
			data: {
				businessUnitId: context.businessUnitId,
				type: `marketing.${input.provider}.${input.action}`,
				summary: input.summary,
				proposedAction: marketingActionPayload(input),
				riskLevel: ApprovalRiskLevel.HIGH,
				metadata: { requiresHumanApproval: true },
			},
			select: { id: true, status: true, summary: true },
		});

		await this.db.businessEvent.create({
			data: {
				businessUnitId: context.businessUnitId,
				type: "marketing.approval.requested",
				source: BusinessEventSource.SYSTEM,
				channel: CommunicationChannel.INTERNAL,
				occurredAt: new Date(),
				data: {
					approvalRequestId: approval.id,
					provider: input.provider,
					action: input.action,
				},
				correlationId: approval.id,
				idempotencyKey: `marketing:approval:${approval.id}`,
			},
		});

		return approval;
	}

	private async adsWorkspace(
		source: BusinessContextSource,
		input: BusinessContextInput,
		provider: MarketingProvider,
	): Promise<AdsWorkspaceOutput> {
		const contextInput = input ?? {};
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, contextInput),
		);
		const integration = await this.integration(
			context.businessUnitId,
			provider,
		);
		if (!integration) return emptyAds(notConfigured(provider));

		const summary = summarizeIntegration(integration);

		try {
			const campaigns =
				provider === MarketingProvider.GOOGLE_ADS
					? await this.ads.googleCampaigns({
							...googleAdsConfig.parse(integration.config ?? {}),
							...googleAdsSecrets.parse(integration.secrets ?? {}),
						})
					: await this.ads.metaCampaigns({
							...metaAdsConfig.parse(integration.config ?? {}),
							...metaAdsSecrets.parse(integration.secrets ?? {}),
						});
			await this.markHealthy(integration.id);

			return {
				integration: summary,
				account: {
					id: summary.accountId ?? "",
					name: summary.label,
				},
				campaigns,
				metrics: adsMetrics(campaigns),
				error: null,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.markUnhealthy(integration.id, message);
			return emptyAds(
				{ ...summary, status: MarketingIntegrationStatus.NEEDS_ATTENTION },
				message,
			);
		}
	}

	private async crm(
		source: BusinessContextSource,
		input: BusinessContextInput,
	) {
		const contextInput = input ?? {};
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, contextInput),
		);
		const [leads, deals, bookings] = await Promise.all([
			this.db.businessEvent.count({
				where: {
					businessUnitId: context.businessUnitId,
					type: { contains: "lead", mode: "insensitive" },
				},
			}),
			this.db.deal.count({ where: dealScope(context) }),
			this.db.booking.count({ where: bookingScope(context) }),
		]);

		return {
			campaignLeads: leads,
			deals,
			bookings,
			revenueCents: null,
			measured: false,
		};
	}

	private integration(businessUnitId: string, provider: MarketingProvider) {
		return this.db.marketingIntegration.findUnique({
			where: { businessUnitId_provider: { businessUnitId, provider } },
			select: integrationSelect,
		});
	}

	private async markHealthy(id: string): Promise<void> {
		await this.db.marketingIntegration.update({
			where: { id },
			data: {
				status: MarketingIntegrationStatus.CONNECTED,
				lastCheckedAt: new Date(),
				lastError: null,
			},
		});
	}

	private async markUnhealthy(id: string, message: string): Promise<void> {
		await this.db.marketingIntegration.update({
			where: { id },
			data: {
				status: MarketingIntegrationStatus.NEEDS_ATTENTION,
				lastCheckedAt: new Date(),
				lastError: message,
			},
		});
	}
}

const integrationSelect = {
	id: true,
	provider: true,
	status: true,
	label: true,
	config: true,
	secrets: true,
	lastCheckedAt: true,
	lastError: true,
} as const;

function summarizeIntegration(row: {
	provider: MarketingProvider;
	status: MarketingIntegrationStatus;
	label: string;
	config: Prisma.JsonValue | null;
	secrets: Prisma.JsonValue | null;
	lastCheckedAt: Date | null;
	lastError: string | null;
}): MarketingIntegrationOutput {
	const config = configRecord(row.config);
	return {
		provider: row.provider,
		status: row.status,
		label: row.label,
		configured: row.status !== MarketingIntegrationStatus.NOT_CONFIGURED,
		accountId:
			textOf(config.customerId) ??
			textOf(config.adAccountId) ??
			textOf(config.accountId),
		baseUrl: textOf(config.baseUrl),
		authMethod: textOf(config.authMethod),
		lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
		lastError: row.lastError,
	};
}

function notConfigured(
	provider: MarketingProvider,
): MarketingIntegrationOutput {
	return {
		provider,
		status: MarketingIntegrationStatus.NOT_CONFIGURED,
		label: labelFor(provider),
		configured: false,
		accountId: null,
		baseUrl: null,
		authMethod: null,
		lastCheckedAt: null,
		lastError: null,
	};
}

function emptyEmail(
	integration: MarketingIntegrationOutput,
	error: string | null = null,
): EmailMarketingOutput {
	return {
		integration,
		campaigns: [],
		lists: [],
		templates: [],
		subscribers: { total: null },
		metrics: [
			{ label: "Sent", value: null, unit: "messages", measured: false },
			{ label: "Opens", value: null, unit: "events", measured: false },
			{ label: "Clicks", value: null, unit: "events", measured: false },
			{ label: "Unsubscribes", value: null, unit: "people", measured: false },
		],
		error,
	};
}

function emptyAds(
	integration: MarketingIntegrationOutput,
	error: string | null = null,
): AdsWorkspaceOutput {
	return {
		integration,
		account: null,
		campaigns: [],
		metrics: [
			{ label: "Spend", value: null, unit: "micros", measured: false },
			{ label: "Leads", value: null, unit: "conversions", measured: false },
			{ label: "CPL", value: null, unit: "micros", measured: false },
			{ label: "ROAS", value: null, unit: "ratio", measured: false },
		],
		error,
	};
}

function emailMetrics(campaigns: EmailMarketingOutput["campaigns"]) {
	return [
		{
			label: "Sent",
			value: sumNullable(campaigns, (row) => row.sent),
			unit: "messages",
			measured: campaigns.some((row) => row.sent !== null),
		},
		{
			label: "Opens",
			value: sumNullable(campaigns, (row) => row.opens),
			unit: "events",
			measured: campaigns.some((row) => row.opens !== null),
		},
		{
			label: "Clicks",
			value: sumNullable(campaigns, (row) => row.clicks),
			unit: "events",
			measured: campaigns.some((row) => row.clicks !== null),
		},
		{
			label: "Unsubscribes",
			value: sumNullable(campaigns, (row) => row.unsubscribes),
			unit: "people",
			measured: campaigns.some((row) => row.unsubscribes !== null),
		},
	];
}

function adsMetrics(campaigns: AdsCampaign[]) {
	const spend = sumNullable(campaigns, (row) => row.spendMicros);
	const conversions = sumNullable(campaigns, (row) => row.conversions);
	const value = sumNullable(campaigns, (row) => row.conversionValue);

	return [
		{
			label: "Spend",
			value: spend,
			unit: "micros",
			measured: campaigns.some((row) => row.spendMicros !== null),
		},
		{
			label: "Leads",
			value: conversions,
			unit: "conversions",
			measured: campaigns.some((row) => row.conversions !== null),
		},
		{
			label: "CPL",
			value:
				spend !== null && conversions ? Math.round(spend / conversions) : null,
			unit: "micros",
			measured: spend !== null && Boolean(conversions),
		},
		{
			label: "ROAS",
			value: spend && value ? value / (spend / 1_000_000) : null,
			unit: "ratio",
			measured: Boolean(spend && value),
		},
	];
}

function labelFor(provider: MarketingProvider): string {
	if (provider === MarketingProvider.LISTMONK) return "Listmonk";
	if (provider === MarketingProvider.GOOGLE_ADS) return "Google Ads";
	return "Meta Ads";
}

function hostnameOf(value: string): string | null {
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

function configRecord(
	value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> {
	if (value === null || Array.isArray(value) || !(value instanceof Object)) {
		return {};
	}
	return Object.fromEntries(Object.entries(value)) as Record<
		string,
		Prisma.JsonValue
	>;
}

function textOf(value: Prisma.JsonValue | undefined): string | null {
	const parsed = z.string().safeParse(value);
	return parsed.success ? parsed.data : null;
}

function sourceWithBusinessUnit(
	source: BusinessContextSource,
	input: { businessUnitId?: string },
): BusinessContextSource {
	return {
		...source,
		businessUnitId: input.businessUnitId ?? source.businessUnitId,
	};
}

function marketingActionPayload(
	input: RequestMarketingActionInput,
): Prisma.InputJsonObject {
	return {
		provider: input.provider,
		action: input.action,
		payload: JSON.parse(JSON.stringify(input.payload)),
	};
}

function jsonObject(
	input: Record<string, Prisma.InputJsonValue | undefined>,
): Prisma.InputJsonObject {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	) as Prisma.InputJsonObject;
}

function sumNullable<T>(
	rows: T[],
	value: (row: T) => number | null,
): number | null {
	let total = 0;
	let seen = false;
	for (const row of rows) {
		const next = value(row);
		if (next === null) continue;
		total += next;
		seen = true;
	}
	return seen ? total : null;
}

function bookingScope(context: {
	businessUnitId: string;
}): Prisma.BookingWhereInput {
	return {
		OR: [
			{
				communicationConversations: {
					some: { businessUnitId: context.businessUnitId },
				},
			},
			{ businessEvents: { some: { businessUnitId: context.businessUnitId } } },
			{
				approvalRequests: { some: { businessUnitId: context.businessUnitId } },
			},
			{ businessTasks: { some: { businessUnitId: context.businessUnitId } } },
		],
	};
}

function dealScope(context: { businessUnitId: string }): Prisma.DealWhereInput {
	return {
		OR: [
			{
				communicationConversations: {
					some: { businessUnitId: context.businessUnitId },
				},
			},
			{ businessEvents: { some: { businessUnitId: context.businessUnitId } } },
			{
				approvalRequests: { some: { businessUnitId: context.businessUnitId } },
			},
			{ businessTasks: { some: { businessUnitId: context.businessUnitId } } },
		],
	};
}
