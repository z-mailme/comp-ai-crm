import { MarketingCampaignStatus } from "@crm/db";
import { z } from "zod";

export const MARKETING_CHANNELS = [
	"GOOGLE_ADS",
	"META_ADS",
	"EMAIL",
	"SOCIAL",
	"CONTENT",
	"WEBSITE",
] as const;

export const marketingChannel = z.enum(MARKETING_CHANNELS);

const utmFields = {
	utmSource: z.string().trim().min(1).max(120).nullish(),
	utmMedium: z.string().trim().min(1).max(120).nullish(),
	utmCampaign: z.string().trim().min(1).max(120).nullish(),
	utmContent: z.string().trim().min(1).max(120).nullish(),
	utmTerm: z.string().trim().min(1).max(120).nullish(),
};

export const createCampaignInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(160),
	objective: z.string().trim().max(400).nullish(),
	status: z.nativeEnum(MarketingCampaignStatus).optional(),
	startDate: z.string().datetime({ offset: true }).nullish(),
	endDate: z.string().datetime({ offset: true }).nullish(),
	budget: z.number().min(0).max(9_999_999_999_999).nullish(),
	currency: z.string().trim().length(3).optional(),
	targetAudience: z.string().trim().max(400).nullish(),
	channels: z.array(marketingChannel).max(12).default([]),
	notes: z.string().trim().max(4000).nullish(),
	...utmFields,
});

export const updateCampaignInput = createCampaignInput.partial().extend({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const listCampaignsInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	status: z.nativeEnum(MarketingCampaignStatus).optional(),
	query: z.string().trim().max(120).optional(),
});

export const campaignByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	from: z.string().datetime({ offset: true }).optional(),
	to: z.string().datetime({ offset: true }).optional(),
});

export const campaignOutput = z.object({
	id: z.string(),
	name: z.string(),
	objective: z.string().nullable(),
	status: z.nativeEnum(MarketingCampaignStatus),
	startDate: z.string().nullable(),
	endDate: z.string().nullable(),
	budget: z.number().nullable(),
	currency: z.string(),
	targetAudience: z.string().nullable(),
	channels: z.array(marketingChannel),
	notes: z.string().nullable(),
	utmSource: z.string().nullable(),
	utmMedium: z.string().nullable(),
	utmCampaign: z.string().nullable(),
	utmContent: z.string().nullable(),
	utmTerm: z.string().nullable(),
	ownerId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const campaignPerformanceOutput = z.object({
	leads: z.number(),
	firstTouchLeads: z.number(),
	lastTouchLeads: z.number(),
	bookings: z.number(),
	expectedRevenueCents: z.number().nullable(),
	closedRevenueCents: z.number().nullable(),
	unconvertedDeals: z.number(),
	measured: z.boolean(),
	currency: z.string(),
});

export const campaignDetailOutput = z.object({
	campaign: campaignOutput,
	performance: campaignPerformanceOutput,
});

export const campaignListOutput = z.object({
	rows: z.array(campaignOutput),
});

export const sourceBreakdownRow = z.object({
	source: z.string(),
	medium: z.string(),
	leads: z.number(),
	bookings: z.number(),
	closedRevenueCents: z.number().nullable(),
});

export const sourceBreakdownOutput = z.object({
	rows: z.array(sourceBreakdownRow),
	currency: z.string(),
});

export const campaignPerformanceReportInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	from: z.string().datetime({ offset: true }).optional(),
	to: z.string().datetime({ offset: true }).optional(),
});

export const campaignPerformanceReportRow = z.object({
	campaignId: z.string(),
	name: z.string(),
	status: z.nativeEnum(MarketingCampaignStatus),
	channels: z.array(marketingChannel),
	utmCampaign: z.string().nullable(),
	leads: z.number(),
	firstTouchLeads: z.number(),
	lastTouchLeads: z.number(),
	bookings: z.number(),
	expectedRevenueCents: z.number().nullable(),
	closedRevenueCents: z.number().nullable(),
	unconvertedDeals: z.number(),
	currency: z.string(),
	spendMicros: z.number().nullable(),
	spendProvider: z.string().nullable(),
	spendMatched: z.boolean(),
	costPerLeadMicros: z.number().nullable(),
	costPerBookingMicros: z.number().nullable(),
	roas: z.number().nullable(),
	measured: z.boolean(),
});

export const campaignPerformanceReportOutput = z.object({
	rows: z.array(campaignPerformanceReportRow),
});

export type CreateCampaignInput = z.input<typeof createCampaignInput>;
export type UpdateCampaignInput = z.input<typeof updateCampaignInput>;
export type ListCampaignsInput = z.input<typeof listCampaignsInput>;
export type CampaignByIdInput = z.input<typeof campaignByIdInput>;
export type CampaignOutput = z.infer<typeof campaignOutput>;
export type CampaignPerformanceOutput = z.infer<
	typeof campaignPerformanceOutput
>;
export type CampaignPerformanceReportInput = z.infer<
	typeof campaignPerformanceReportInput
>;
export type CampaignPerformanceReportOutput = z.infer<
	typeof campaignPerformanceReportOutput
>;
