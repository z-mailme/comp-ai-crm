import { SocialPostStatus, SocialProvider } from "@crm/db";
import { z } from "zod";

export const socialProvider = z.nativeEnum(SocialProvider);

export const PROVIDER_CAPABILITIES = {
	META_FACEBOOK: {
		label: "Facebook Page",
		publishing: true,
		metrics: ["impressions", "reach", "engagement", "likes", "comments"],
		inbox: ["COMMENT", "MENTION", "MESSAGE"],
		docsVerified: false,
	},
	META_INSTAGRAM: {
		label: "Instagram Professional",
		publishing: true,
		metrics: [
			"impressions",
			"reach",
			"engagement",
			"likes",
			"comments",
			"video_views",
		],
		inbox: ["COMMENT", "MENTION"],
		docsVerified: false,
	},
	LINKEDIN: {
		label: "LinkedIn",
		publishing: false,
		metrics: [],
		inbox: [],
		docsVerified: false,
	},
	TIKTOK: {
		label: "TikTok",
		publishing: false,
		metrics: [],
		inbox: [],
		docsVerified: false,
	},
	YOUTUBE: {
		label: "YouTube",
		publishing: false,
		metrics: [],
		inbox: [],
		docsVerified: false,
	},
} satisfies Record<
	SocialProvider,
	{
		label: string;
		publishing: boolean;
		metrics: string[];
		inbox: string[];
		docsVerified: boolean;
	}
>;

export const SOCIAL_PUBLISH_APPROVAL_TYPE = "marketing.social.publish";

export const listAccountsInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
});

export const registerAccountInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	provider: socialProvider,
	externalAccountId: z.string().trim().min(1).max(160),
	displayName: z.string().trim().min(1).max(160),
	handle: z.string().trim().max(160).nullish(),
	accessToken: z.string().trim().min(1).max(4000),
	scopes: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
});

export const accountByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const listPostsInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	status: z.nativeEnum(SocialPostStatus).optional(),
	from: z.string().datetime({ offset: true }).optional(),
	to: z.string().datetime({ offset: true }).optional(),
});

export const createPostInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	contentId: z.string().trim().min(1).nullish(),
	campaignId: z.string().trim().min(1).nullish(),
	caption: z.string().min(1).max(20000),
	mediaUrls: z.array(z.string().trim().url().max(1000)).max(20).default([]),
	accountIds: z.array(z.string().trim().min(1)).min(1).max(20),
	scheduledAt: z.string().datetime({ offset: true }).nullish(),
	idempotencyKey: z.string().trim().min(1).max(200).nullish(),
});

export const postByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const schedulePostInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	scheduledAt: z.string().datetime({ offset: true }),
});

export const decidePostInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	decision: z.enum(["APPROVE", "REJECT"]),
	note: z.string().trim().max(1000).optional(),
});

export const socialCalendarInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	from: z.string().datetime({ offset: true }),
	to: z.string().datetime({ offset: true }),
});

export const accountOutput = z.object({
	id: z.string(),
	provider: socialProvider,
	providerLabel: z.string(),
	externalAccountId: z.string(),
	displayName: z.string(),
	handle: z.string().nullable(),
	scopes: z.array(z.string()),
	status: z.enum(["CONNECTED", "NEEDS_ATTENTION", "DISCONNECTED"]),
	connectedAt: z.string(),
	lastSyncAt: z.string().nullable(),
	publishing: z.boolean(),
	docsVerified: z.boolean(),
});

export const accountListOutput = z.object({
	rows: z.array(accountOutput),
});

export const postTargetOutput = z.object({
	accountId: z.string(),
	accountName: z.string(),
	provider: socialProvider,
	status: z.enum(["PENDING", "PUBLISHED", "FAILED"]),
	providerPostId: z.string().nullable(),
	publishedAt: z.string().nullable(),
	error: z.string().nullable(),
});

export const postOutput = z.object({
	id: z.string(),
	campaignId: z.string().nullable(),
	contentId: z.string().nullable(),
	caption: z.string(),
	mediaUrls: z.array(z.string()),
	status: z.nativeEnum(SocialPostStatus),
	scheduledAt: z.string().nullable(),
	requestedAt: z.string().nullable(),
	publishedAt: z.string().nullable(),
	providerPostId: z.string().nullable(),
	error: z.string().nullable(),
	idempotencyKey: z.string(),
	approvedById: z.string().nullable(),
	approvedAt: z.string().nullable(),
	targets: z.array(postTargetOutput),
	createdAt: z.string(),
});

export const postListOutput = z.object({
	rows: z.array(postOutput),
});

export const socialCalendarItemOutput = z.object({
	kind: z.enum(["SOCIAL_POST", "CONTENT", "CAMPAIGN"]),
	id: z.string(),
	title: z.string(),
	status: z.string(),
	at: z.string(),
	endAt: z.string().nullable(),
	platforms: z.array(z.string()),
	campaignId: z.string().nullable(),
	mediaUrl: z.string().nullable(),
});

export const socialCalendarOutput = z.object({
	items: z.array(socialCalendarItemOutput),
});

export const socialInboxItemOutput = z.object({
	id: z.string(),
	accountId: z.string(),
	accountName: z.string(),
	kind: z.enum(["COMMENT", "MENTION", "MESSAGE"]),
	authorName: z.string().nullable(),
	text: z.string().nullable(),
	occurredAt: z.string(),
	status: z.enum(["UNREAD", "READ", "ARCHIVED"]),
});

export const socialInboxOutput = z.object({
	available: z.boolean(),
	rows: z.array(socialInboxItemOutput),
});

export type RegisterAccountInput = z.input<typeof registerAccountInput>;
export type ListPostsInput = z.input<typeof listPostsInput>;
export type CreatePostInput = z.input<typeof createPostInput>;
export type SchedulePostInput = z.input<typeof schedulePostInput>;
export type DecidePostInput = z.input<typeof decidePostInput>;
export type SocialCalendarInput = z.input<typeof socialCalendarInput>;
export type AccountOutput = z.infer<typeof accountOutput>;
export type PostOutput = z.infer<typeof postOutput>;
