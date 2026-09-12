import {
	ApprovalRiskLevel,
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	DealStage,
	MarketingIntegrationStatus,
	MarketingProvider,
	Prisma,
} from "@crm/db";
import { readReportingCurrency } from "@crm/db/settings";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import { type AdsCampaign, AdsClient } from "./ads.client";
import { MarketingAttributionService } from "./attribution.service";
import { MarketingEmailService } from "./email.service";
import { ListmonkClient, type ListmonkConfig } from "./listmonk.client";
import {
	type AdsConnectionInput,
	type AdsSnapshotPayload,
	type AdsWorkspaceOutput,
	adsSnapshotPayload,
	type BusinessContextInput,
	type CreateListmonkCampaignInput,
	type EmailMarketingOutput,
	type ListmonkConnectionInput,
	type MarketingIntegrationOutput,
	type MarketingIntegrationRow,
	type MarketingOverviewOutput,
	type PerformanceSummaryInput,
	type PerformanceSummaryOutput,
	type RequestMarketingActionInput,
	type SendListmonkTestInput,
	type SyncAdsInput,
	type SyncAdsOutput,
} from "./marketing.contracts";
import { MARKETING_ADS } from "./marketing-config";

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
		private readonly emailService: MarketingEmailService,
		private readonly attribution: MarketingAttributionService,
	) {}

	async overview(
		source: BusinessContextSource,
		input: BusinessContextInput,
	): Promise<MarketingOverviewOutput> {
		const contextInput = input ?? {};
		const [email, googleAds, metaAds, crm, attributedVisitors] =
			await Promise.all([
				this.email(source, contextInput),
				this.googleAds(source, contextInput),
				this.metaAds(source, contextInput),
				this.crm(source, contextInput),
				this.attributedVisitors(),
			]);

		return {
			email,
			googleAds,
			metaAds,
			crm,
			attribution: attributionStatus(attributedVisitors),
		};
	}

	async performanceSummary(
		source: BusinessContextSource,
		input: PerformanceSummaryInput,
	): Promise<PerformanceSummaryOutput> {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		const { from, to } = rangeDates(input.range);
		const [breakdown, attributedVisitors, snapshots, currency] =
			await Promise.all([
				this.attribution.sourceBreakdown({ from, to }),
				this.attributedVisitors(),
				this.db.marketingAdsSnapshot.findMany({
					where: { businessUnitId: context.businessUnitId },
					select: { payload: true, error: true },
				}),
				readReportingCurrency(this.db),
			]);

		let leads = 0;
		let bookings = 0;
		let revenueCents = 0;
		let revenueSeen = false;
		for (const row of breakdown.rows) {
			leads += row.leads;
			bookings += row.bookings;
			if (row.closedRevenueCents !== null) {
				revenueCents += row.closedRevenueCents;
				revenueSeen = true;
			}
		}

		let spendMicros = 0;
		let spendSeen = false;
		for (const snapshot of snapshots) {
			const parsed = adsSnapshotPayload.safeParse(snapshot.payload);
			if (!parsed.success) continue;
			for (const campaign of parsed.data.campaigns) {
				if (campaign.spendMicros === null) continue;
				spendMicros += campaign.spendMicros;
				spendSeen = true;
			}
		}

		const adSpendMicros = spendSeen ? spendMicros : null;
		const attributedRevenueCents = revenueSeen ? revenueCents : null;
		const notes: string[] = [];
		if (attributedVisitors === 0) {
			notes.push(
				"No tracked visitors are linked to CRM contacts yet. Leads, bookings and revenue only cover attributed sources.",
			);
		}
		if (!spendSeen) {
			notes.push(
				"No ads snapshot with spend exists for this business. Use Sync now on the Google Ads or Meta Ads page.",
			);
		}
		if (leads === 0) {
			notes.push(
				"No attributed leads in this range, so cost per lead is not computed.",
			);
		}
		if (spendSeen && revenueSeen) {
			notes.push(
				"Ad spend uses the ad account currency and revenue uses the reporting currency. Cost per lead, cost per booking and ROAS assume both match.",
			);
		}

		return {
			range: input.range,
			from: from.toISOString(),
			to: to.toISOString(),
			currency,
			leads,
			bookings,
			attributedRevenueCents,
			adSpendMicros,
			costPerLeadMicros:
				adSpendMicros !== null && leads > 0
					? Math.round(adSpendMicros / leads)
					: null,
			costPerBookingMicros:
				adSpendMicros !== null && bookings > 0
					? Math.round(adSpendMicros / bookings)
					: null,
			roas:
				adSpendMicros !== null &&
				adSpendMicros > 0 &&
				attributedRevenueCents !== null
					? attributedRevenueCents / 100 / (adSpendMicros / 1_000_000)
					: null,
			attribution: attributionStatus(attributedVisitors),
			notes,
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
		const pendingSchedules = await this.emailService.pendingSchedules(
			context.businessUnitId,
		);
		if (!integration)
			return emptyEmail(
				notConfigured(MarketingProvider.LISTMONK),
				null,
				pendingSchedules,
			);

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
				pendingSchedules,
				metrics: emailMetrics(campaigns),
				error: null,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.markUnhealthy(integration.id, message);
			return emptyEmail(
				{ ...summary, status: MarketingIntegrationStatus.NEEDS_ATTENTION },
				message,
				pendingSchedules,
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
		const snapshot = await this.db.marketingAdsSnapshot.findUnique({
			where: {
				businessUnitId_provider_kind: {
					businessUnitId: context.businessUnitId,
					provider,
					kind: MARKETING_ADS.snapshotKind,
				},
			},
		});
		if (!snapshot) return emptyAds(summary);

		const parsed = adsSnapshotPayload.safeParse(snapshot.payload);
		if (!parsed.success) {
			return emptyAds(
				summary,
				"The cached ads report could not be read. Run a sync to rebuild it.",
				snapshot.syncedAt.toISOString(),
			);
		}

		return {
			integration: summary,
			account: {
				id: summary.accountId ?? "",
				name: summary.label,
			},
			campaigns: parsed.data.campaigns,
			searchTerms: parsed.data.searchTerms,
			syncedAt: snapshot.syncedAt.toISOString(),
			metrics: adsMetrics(parsed.data.campaigns),
			error: snapshot.error,
		};
	}

	async syncAds(
		source: BusinessContextSource,
		input: SyncAdsInput,
	): Promise<SyncAdsOutput> {
		const context = await resolveBusinessContext(
			this.db,
			sourceWithBusinessUnit(source, input),
		);
		return this.syncProvider(context.businessUnitId, input.provider);
	}

	async syncAllAds(): Promise<SyncAdsOutput[]> {
		const integrations = await this.db.marketingIntegration.findMany({
			where: {
				provider: {
					in: [MarketingProvider.GOOGLE_ADS, MarketingProvider.META_ADS],
				},
				status: MarketingIntegrationStatus.CONNECTED,
			},
			select: { businessUnitId: true, provider: true },
		});

		const results: SyncAdsOutput[] = [];
		for (const row of integrations) {
			results.push(await this.syncProvider(row.businessUnitId, row.provider));
		}
		return results;
	}

	private async syncProvider(
		businessUnitId: string,
		provider: MarketingProvider,
	): Promise<SyncAdsOutput> {
		const integration = await this.db.marketingIntegration.findUnique({
			where: { businessUnitId_provider: { businessUnitId, provider } },
			select: integrationSelect,
		});
		if (
			!integration ||
			integration.status === MarketingIntegrationStatus.NOT_CONFIGURED
		) {
			return {
				provider,
				synced: false,
				campaigns: 0,
				syncedAt: null,
				error: `${labelFor(provider)} is not connected.`,
			};
		}

		try {
			const payload =
				provider === MarketingProvider.GOOGLE_ADS
					? await this.googleSnapshot(integration)
					: await this.metaSnapshot(integration);
			const snapshot = await this.db.marketingAdsSnapshot.upsert({
				where: {
					businessUnitId_provider_kind: {
						businessUnitId,
						provider,
						kind: MARKETING_ADS.snapshotKind,
					},
				},
				create: {
					businessUnitId,
					provider,
					kind: MARKETING_ADS.snapshotKind,
					payload,
					error: null,
					syncedAt: new Date(),
				},
				update: {
					payload,
					error: null,
					syncedAt: new Date(),
				},
			});
			await this.markHealthy(integration.id);
			return {
				provider,
				synced: true,
				campaigns: payload.campaigns.length,
				syncedAt: snapshot.syncedAt.toISOString(),
				error: null,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const existing = await this.db.marketingAdsSnapshot.findUnique({
				where: {
					businessUnitId_provider_kind: {
						businessUnitId,
						provider,
						kind: MARKETING_ADS.snapshotKind,
					},
				},
				select: { id: true, syncedAt: true },
			});
			if (existing) {
				await this.db.marketingAdsSnapshot.update({
					where: { id: existing.id },
					data: { error: message },
				});
			} else {
				await this.db.marketingAdsSnapshot.create({
					data: {
						businessUnitId,
						provider,
						kind: MARKETING_ADS.snapshotKind,
						payload: { campaigns: [], searchTerms: [] },
						error: message,
					},
				});
			}
			await this.markUnhealthy(integration.id, message);
			return {
				provider,
				synced: false,
				campaigns: 0,
				syncedAt: existing?.syncedAt.toISOString() ?? null,
				error: message,
			};
		}
	}

	private async googleSnapshot(
		integration: MarketingIntegrationRow & { id: string },
	): Promise<AdsSnapshotPayload> {
		const config = {
			...googleAdsConfig.parse(integration.config ?? {}),
			...googleAdsSecrets.parse(integration.secrets ?? {}),
		};
		const [campaigns, adGroups, searchTerms] = await Promise.all([
			this.ads.googleCampaigns(config),
			this.ads.googleAdGroups(config),
			this.ads.googleSearchTerms(config),
		]);
		for (const campaign of campaigns) {
			campaign.children = adGroups.get(campaign.id) ?? [];
		}
		return { campaigns, searchTerms };
	}

	private async metaSnapshot(
		integration: MarketingIntegrationRow & { id: string },
	): Promise<AdsSnapshotPayload> {
		const config = {
			...metaAdsConfig.parse(integration.config ?? {}),
			...metaAdsSecrets.parse(integration.secrets ?? {}),
		};
		const [campaigns, adSets, ads] = await Promise.all([
			this.ads.metaCampaigns(config),
			this.ads.metaAdSets(config),
			this.ads.metaAds(config),
		]);
		for (const [campaignId, children] of adSets) {
			for (const child of children) {
				child.children = ads.get(child.id) ?? [];
			}
			const campaign = campaigns.find((row) => row.id === campaignId);
			if (campaign) campaign.children = children;
		}
		return { campaigns, searchTerms: [] };
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
		const [leads, deals, bookings, closedDeals, currency] = await Promise.all([
			this.db.businessEvent.count({
				where: {
					businessUnitId: context.businessUnitId,
					type: { contains: "lead", mode: "insensitive" },
				},
			}),
			this.db.deal.count({ where: dealScope(context) }),
			this.db.booking.count({ where: bookingScope(context) }),
			this.db.deal.findMany({
				where: {
					AND: [
						dealScope(context),
						{ stage: DealStage.CLOSED_WON, archivedAt: null },
					],
				},
				select: { baseAmount: true, baseCurrency: true },
			}),
			readReportingCurrency(this.db),
		]);

		let cents = 0;
		let seen = false;
		let unconverted = 0;
		for (const deal of closedDeals) {
			if (deal.baseAmount === null || deal.baseCurrency !== currency) {
				unconverted += 1;
				continue;
			}
			cents += Number(deal.baseAmount) * 100;
			seen = true;
		}

		return {
			campaignLeads: leads,
			deals,
			bookings,
			revenueCents: seen ? Math.round(cents) : null,
			measured: seen && unconverted === 0,
		};
	}

	private attributedVisitors(): Promise<number> {
		return this.db.trackedVisitor.count({
			where: { contactId: { not: null } },
		});
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
	pendingSchedules: EmailMarketingOutput["pendingSchedules"] = [],
): EmailMarketingOutput {
	return {
		integration,
		campaigns: [],
		lists: [],
		templates: [],
		subscribers: { total: null },
		pendingSchedules,
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
	syncedAt: string | null = null,
): AdsWorkspaceOutput {
	return {
		integration,
		account: null,
		campaigns: [],
		searchTerms: [],
		syncedAt,
		metrics: [
			{ label: "Spend", value: null, unit: "micros", measured: false },
			{ label: "Leads", value: null, unit: "conversions", measured: false },
			{ label: "CPL", value: null, unit: "micros", measured: false },
			{ label: "CPM", value: null, unit: "micros", measured: false },
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
	const impressions = sumNullable(campaigns, (row) => row.impressions);
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
			label: "CPM",
			value:
				spend !== null && impressions
					? Math.round((spend / impressions) * 1000)
					: null,
			unit: "micros",
			measured: spend !== null && Boolean(impressions),
		},
		{
			label: "ROAS",
			value: spend && value ? value / (spend / 1_000_000) : null,
			unit: "ratio",
			measured: Boolean(spend && value),
		},
	];
}

function attributionStatus(attributedVisitors: number) {
	if (attributedVisitors === 0) {
		return {
			available: false,
			attributedVisitors,
			status:
				"No tracked visitors are linked to CRM contacts yet. Attribution starts when the tracking script identifies a visitor.",
		};
	}
	return {
		available: true,
		attributedVisitors,
		status: `Attribution is live: ${attributedVisitors} tracked visitors are linked to CRM contacts.`,
	};
}

function rangeDates(range: "today" | "7d" | "28d" | "90d") {
	const to = new Date();
	const from = new Date(to);
	if (range === "today") {
		from.setHours(0, 0, 0, 0);
		return { from, to };
	}
	const days = range === "7d" ? 7 : range === "28d" ? 28 : 90;
	from.setDate(from.getDate() - days);
	return { from, to };
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
