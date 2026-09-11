import {
	BookingResourceType,
	BookingStatus,
	DealStage,
	RecordSource,
} from "@crm/db";
import { z } from "zod";
import { businessContextInput } from "../business-os/business-os.contracts";

export const audienceRules = z.object({
	consent: z.enum(["allowed", "blocked", "any"]).default("allowed"),
	sources: z.array(z.nativeEnum(RecordSource)).max(10).optional(),
	utmSources: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
	utmCampaigns: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
	companyCities: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
	companyCountries: z.array(z.string().trim().min(2).max(2)).max(20).optional(),
	dealStages: z.array(z.nativeEnum(DealStage)).max(10).optional(),
	bookingStatuses: z.array(z.nativeEnum(BookingStatus)).max(10).optional(),
	resourceTypes: z.array(z.nativeEnum(BookingResourceType)).max(10).optional(),
	createdAfter: z.string().datetime({ offset: true }).optional(),
	createdBefore: z.string().datetime({ offset: true }).optional(),
	lastActivityBefore: z.string().datetime({ offset: true }).optional(),
	minDealAmount: z.number().nonnegative().optional(),
	hasBooking: z.boolean().optional(),
});

export const audienceContextInput = businessContextInput;

export const audienceByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const audienceCountInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	rules: audienceRules,
});

export const createAudienceInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(400).optional(),
	rules: audienceRules,
});

export const updateAudienceInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).max(160).optional(),
	description: z.string().trim().max(400).nullable().optional(),
	rules: audienceRules.optional(),
});

export const audienceExportInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const audienceOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: z.string(),
	rules: audienceRules,
	count: z.number(),
	provider: z.string().nullable(),
	providerListId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const audienceListOutput = z.object({
	audiences: z.array(audienceOutput),
	consent: z.object({
		allowed: z.number(),
		blocked: z.number(),
		unsubscribed: z.number(),
		total: z.number(),
	}),
});

export const audienceCountOutput = z.object({
	count: z.number(),
});

export const audienceExportOutput = z.object({
	listId: z.number(),
	synced: z.number(),
	existing: z.number(),
	failed: z.number(),
});

export type AudienceRules = z.infer<typeof audienceRules>;
export type CreateAudienceInput = z.infer<typeof createAudienceInput>;
export type UpdateAudienceInput = z.infer<typeof updateAudienceInput>;
export type AudienceCountInput = z.infer<typeof audienceCountInput>;
export type AudienceOutput = z.infer<typeof audienceOutput>;
