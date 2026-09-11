import { MarketingContentStatus, MarketingContentType } from "@crm/db";
import { z } from "zod";

export const MARKETING_PLATFORMS = [
	"INSTAGRAM",
	"FACEBOOK",
	"LINKEDIN",
	"TIKTOK",
	"X",
	"EMAIL",
	"BLOG",
	"WEBSITE",
] as const;

export const marketingPlatform = z.enum(MARKETING_PLATFORMS);

export const PLATFORM_LIMITS = {
	INSTAGRAM: { captionChars: 2200, hashtags: 30 },
	FACEBOOK: { captionChars: 63_206, hashtags: null },
	LINKEDIN: { captionChars: 3000, hashtags: null },
	TIKTOK: { captionChars: 2200, hashtags: null },
	X: { captionChars: 280, hashtags: null },
	EMAIL: { captionChars: null, hashtags: null },
	BLOG: { captionChars: null, hashtags: null },
	WEBSITE: { captionChars: null, hashtags: null },
} satisfies Record<
	(typeof MARKETING_PLATFORMS)[number],
	{ captionChars: number | null; hashtags: number | null }
>;

export const CONTENT_APPROVAL_TYPE = "marketing.content.review";

export const hashtagList = z
	.array(z.string().trim().min(1).max(60))
	.max(60)
	.default([]);

export const listContentInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	status: z.nativeEnum(MarketingContentStatus).optional(),
	type: z.nativeEnum(MarketingContentType).optional(),
	campaignId: z.string().trim().min(1).optional(),
	query: z.string().trim().max(120).optional(),
});

export const contentByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const createContentInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	campaignId: z.string().trim().min(1).nullish(),
	title: z.string().trim().min(1).max(200),
	type: z.nativeEnum(MarketingContentType).optional(),
	platforms: z.array(marketingPlatform).max(12).default([]),
	caption: z.string().max(20000).nullish(),
	headline: z.string().trim().max(300).nullish(),
	cta: z.string().trim().max(120).nullish(),
	link: z.string().trim().url().max(1000).nullish(),
	hashtags: hashtagList.optional(),
	internalNotes: z.string().max(4000).nullish(),
});

export const updateContentInput = createContentInput.partial().extend({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const decideContentInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
	note: z.string().trim().max(1000).optional(),
});

export const scheduleContentInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	scheduledAt: z.string().datetime({ offset: true }),
});

export const aiAssistInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	instruction: z.string().trim().max(2000).default(""),
});

export const contentSuggestionOutput = z.object({
	caption: z.string(),
	headline: z.string().nullable(),
	variants: z.array(z.string()),
	hashtags: z.array(z.string()),
	model: z.string(),
	generatedAt: z.string(),
	instruction: z.string(),
});

export const contentOutput = z.object({
	id: z.string(),
	campaignId: z.string().nullable(),
	title: z.string(),
	type: z.nativeEnum(MarketingContentType),
	status: z.nativeEnum(MarketingContentStatus),
	platforms: z.array(marketingPlatform),
	caption: z.string().nullable(),
	headline: z.string().nullable(),
	cta: z.string().nullable(),
	link: z.string().nullable(),
	hashtags: z.array(z.string()),
	scheduledAt: z.string().nullable(),
	publishedAt: z.string().nullable(),
	internalNotes: z.string().nullable(),
	aiAssisted: z.boolean(),
	aiSuggestion: contentSuggestionOutput.nullable(),
	listmonkCampaignId: z.number().nullable(),
	ownerId: z.string().nullable(),
	approvedById: z.string().nullable(),
	approvedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const contentListOutput = z.object({
	rows: z.array(contentOutput),
});

export const contentMediaItemOutput = z.object({
	assetId: z.string(),
	position: z.number(),
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number(),
	width: z.number().nullable(),
	height: z.number().nullable(),
	blobUrl: z.string().nullable(),
});

export const contentDetailOutput = z.object({
	content: contentOutput,
	media: z.array(contentMediaItemOutput),
	campaignName: z.string().nullable(),
});

export type ListContentInput = z.input<typeof listContentInput>;
export type ContentByIdInput = z.input<typeof contentByIdInput>;
export type CreateContentInput = z.input<typeof createContentInput>;
export type UpdateContentInput = z.input<typeof updateContentInput>;
export type DecideContentInput = z.input<typeof decideContentInput>;
export type ScheduleContentInput = z.input<typeof scheduleContentInput>;
export type AiAssistInput = z.input<typeof aiAssistInput>;
export type ContentOutput = z.infer<typeof contentOutput>;
export type ContentSuggestionOutput = z.infer<typeof contentSuggestionOutput>;
