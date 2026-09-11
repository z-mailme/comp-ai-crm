import {
	MarketingIntegrationStatus,
	MarketingProvider,
	type Prisma,
} from "@crm/db";
import { z } from "zod";
import { businessContextInput } from "../business-os/business-os.contracts";

export const marketingContextInput = businessContextInput;

export const marketingProviderInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	provider: z.nativeEnum(MarketingProvider),
});

export const listmonkConnectionInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
		baseUrl: z.string().url(),
		authMethod: z.enum(["basic", "token"]),
		username: z.string().trim().min(1).max(120).optional(),
		password: z.string().min(1).max(4000).optional(),
		token: z.string().min(1).max(4000).optional(),
	})
	.superRefine((value, context) => {
		if (value.authMethod === "token" && !value.token) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Listmonk token authentication requires a token.",
				path: ["token"],
			});
		}
		if (value.authMethod === "basic" && (!value.username || !value.password)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Listmonk basic authentication requires a user and password.",
				path: ["username"],
			});
		}
	});

export const adsConnectionInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
		provider: z.enum([
			MarketingProvider.GOOGLE_ADS,
			MarketingProvider.META_ADS,
		]),
		accountId: z.string().trim().min(1).max(120),
		label: z.string().trim().min(1).max(120).optional(),
		accessToken: z.string().min(1).max(8000),
		developerToken: z.string().min(1).max(4000).optional(),
		loginCustomerId: z.string().trim().min(1).max(120).optional(),
		graphVersion: z.string().trim().min(1).max(20).optional(),
	})
	.superRefine((value, context) => {
		if (
			value.provider === MarketingProvider.GOOGLE_ADS &&
			!value.developerToken
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Google Ads requires a developer token.",
				path: ["developerToken"],
			});
		}
	});

export const createListmonkCampaignInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(160),
	subject: z.string().trim().min(1).max(240),
	body: z.string().trim().min(1),
	listIds: z.array(z.number().int().positive()).min(1).max(25),
});

export const sendListmonkTestInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	campaignId: z.number().int().positive(),
	recipients: z.array(z.string().email()).min(1).max(10),
});

export const requestMarketingActionInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	provider: z.nativeEnum(MarketingProvider),
	action: z.string().trim().min(1).max(80),
	summary: z.string().trim().min(1).max(240),
	payload: z.record(z.string(), z.unknown()).default({}),
});

export const createListmonkCampaignOutput = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
});

export const marketingIntegrationOutput = z.object({
	provider: z.nativeEnum(MarketingProvider),
	status: z.nativeEnum(MarketingIntegrationStatus),
	label: z.string(),
	configured: z.boolean(),
	accountId: z.string().nullable(),
	baseUrl: z.string().nullable(),
	authMethod: z.string().nullable(),
	lastCheckedAt: z.string().nullable(),
	lastError: z.string().nullable(),
});

const metricOutput = z.object({
	label: z.string(),
	value: z.number().nullable(),
	unit: z.string(),
	measured: z.boolean(),
});

const listmonkCampaignOutput = z.object({
	id: z.number(),
	name: z.string(),
	subject: z.string().nullable(),
	status: z.string(),
	type: z.string().nullable(),
	sent: z.number().nullable(),
	opens: z.number().nullable(),
	clicks: z.number().nullable(),
	bounces: z.number().nullable(),
	unsubscribes: z.number().nullable(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
	startedAt: z.string().nullable(),
});

const listmonkListOutput = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string(),
	status: z.string(),
	subscriberCount: z.number().nullable(),
});

const listmonkTemplateOutput = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string().nullable(),
});

const adsMetricFields = {
	spendMicros: z.number().nullable(),
	impressions: z.number().nullable(),
	clicks: z.number().nullable(),
	ctr: z.number().nullable(),
	cpcMicros: z.number().nullable(),
	conversions: z.number().nullable(),
	conversionValue: z.number().nullable(),
	cpaMicros: z.number().nullable(),
	roas: z.number().nullable(),
	reach: z.number().nullable(),
	cpmMicros: z.number().nullable(),
	costPerResultMicros: z.number().nullable(),
};

const adsEntityBase = {
	id: z.string(),
	name: z.string(),
	status: z.string(),
	type: z.string().nullable(),
	...adsMetricFields,
};

const adsAdOutput = z.object(adsEntityBase);

const adsChildOutput = z.object({
	...adsEntityBase,
	children: z.array(adsAdOutput),
});

const adsCampaignOutput = z.object({
	...adsEntityBase,
	budgetMicros: z.number().nullable(),
	children: z.array(adsChildOutput),
});

export const adsSearchTermOutput = z.object({
	term: z.string(),
	campaignId: z.string(),
	campaignName: z.string(),
	adGroupId: z.string().nullable(),
	adGroupName: z.string().nullable(),
	impressions: z.number().nullable(),
	clicks: z.number().nullable(),
	ctr: z.number().nullable(),
	costMicros: z.number().nullable(),
	conversions: z.number().nullable(),
});

export const adsSnapshotPayload = z.object({
	campaigns: z.array(adsCampaignOutput),
	searchTerms: z.array(adsSearchTermOutput),
});

export const syncAdsInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	provider: z.enum([MarketingProvider.GOOGLE_ADS, MarketingProvider.META_ADS]),
});

export const syncAdsOutput = z.object({
	provider: z.nativeEnum(MarketingProvider),
	synced: z.boolean(),
	campaigns: z.number(),
	syncedAt: z.string().nullable(),
	error: z.string().nullable(),
});

export const emailPendingScheduleOutput = z.object({
	id: z.string(),
	summary: z.string(),
	campaignId: z.number(),
	campaignName: z.string().nullable(),
	sendAt: z.string(),
	createdAt: z.string(),
});

export const emailMarketingOutput = z.object({
	integration: marketingIntegrationOutput,
	campaigns: z.array(listmonkCampaignOutput),
	lists: z.array(listmonkListOutput),
	templates: z.array(listmonkTemplateOutput),
	subscribers: z.object({
		total: z.number().nullable(),
	}),
	pendingSchedules: z.array(emailPendingScheduleOutput),
	metrics: z.array(metricOutput),
	error: z.string().nullable(),
});

export const adsWorkspaceOutput = z.object({
	integration: marketingIntegrationOutput,
	account: z
		.object({
			id: z.string(),
			name: z.string(),
		})
		.nullable(),
	campaigns: z.array(adsCampaignOutput),
	searchTerms: z.array(adsSearchTermOutput),
	syncedAt: z.string().nullable(),
	metrics: z.array(metricOutput),
	error: z.string().nullable(),
});

export const marketingOverviewOutput = z.object({
	email: emailMarketingOutput,
	googleAds: adsWorkspaceOutput,
	metaAds: adsWorkspaceOutput,
	crm: z.object({
		campaignLeads: z.number(),
		deals: z.number(),
		bookings: z.number(),
		revenueCents: z.number().nullable(),
		measured: z.boolean(),
	}),
	attribution: z.object({
		available: z.boolean(),
		status: z.string(),
	}),
});

export const approvalRequestOutput = z.object({
	id: z.string(),
	status: z.string(),
	summary: z.string(),
});

export type BusinessContextInput = z.infer<typeof marketingContextInput>;
export type MarketingProviderInput = z.infer<typeof marketingProviderInput>;
export type ListmonkConnectionInput = z.infer<typeof listmonkConnectionInput>;
export type AdsConnectionInput = z.infer<typeof adsConnectionInput>;
export type CreateListmonkCampaignInput = z.infer<
	typeof createListmonkCampaignInput
>;
export type CreateListmonkCampaignOutput = z.infer<
	typeof createListmonkCampaignOutput
>;
export type SendListmonkTestInput = z.infer<typeof sendListmonkTestInput>;
export type RequestMarketingActionInput = z.infer<
	typeof requestMarketingActionInput
>;
export type SyncAdsInput = z.infer<typeof syncAdsInput>;
export type SyncAdsOutput = z.infer<typeof syncAdsOutput>;
export type AdsSnapshotPayload = z.infer<typeof adsSnapshotPayload>;
export type MarketingIntegrationOutput = z.infer<
	typeof marketingIntegrationOutput
>;
export type EmailMarketingOutput = z.infer<typeof emailMarketingOutput>;
export type AdsWorkspaceOutput = z.infer<typeof adsWorkspaceOutput>;
export type MarketingOverviewOutput = z.infer<typeof marketingOverviewOutput>;
export type MarketingIntegrationRow = Prisma.MarketingIntegrationGetPayload<{
	select: {
		provider: true;
		status: true;
		label: true;
		config: true;
		secrets: true;
		lastCheckedAt: true;
		lastError: true;
	};
}>;
