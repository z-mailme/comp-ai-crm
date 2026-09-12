import {
	CanvaRenderStatus,
	DriveAssetApprovalState,
	DriveMediaKind,
	MarketingAutomationMode,
	MarketingContentStatus,
	MarketingContentType,
	PublishErrorCategory,
} from "@crm/db";
import { z } from "zod";
import { hashtagList, marketingPlatform } from "./content.contracts";
import { MARKETING_AUTOMATION } from "./marketing-config";

const businessUnitId = z.string().trim().min(1).optional();
const contentId = z.string().trim().min(1);
const idempotencyKey = z.string().trim().min(8).max(200);
const dateTimeString = z.string().datetime({ offset: true });
const serviceName = z.string().trim().min(1).max(80);

export const automationMode = z.nativeEnum(MarketingAutomationMode);
export const driveApprovalState = z.nativeEnum(DriveAssetApprovalState);
export const canvaRenderStatus = z.nativeEnum(CanvaRenderStatus);
export const publishErrorCategory = z.nativeEnum(PublishErrorCategory);

const automationStatuses = [
	MarketingContentStatus.DRAFT,
	MarketingContentStatus.PLANNED,
	MarketingContentStatus.MEDIA_SELECTED,
	MarketingContentStatus.COPY_GENERATED,
	MarketingContentStatus.DESIGN_GENERATED,
	MarketingContentStatus.AWAITING_APPROVAL,
	MarketingContentStatus.APPROVED,
	MarketingContentStatus.SCHEDULED,
	MarketingContentStatus.PUBLISHING,
	MarketingContentStatus.PUBLISHED,
	MarketingContentStatus.FAILED,
	MarketingContentStatus.CANCELLED,
] as const;

export const automationContentStatus = z.enum(automationStatuses);

// A — automation configuration
export const automationConfigInput = z.object({ businessUnitId });

export const automationConfigOutput = z.object({
	mode: automationMode,
	autopilotEnabled: z.boolean(),
	mediaCooldownDays: z.number(),
	planHorizonDays: z.number(),
	services: z.array(z.string()),
	contentTypes: z.array(z.string()),
	platforms: z.array(z.string()),
	publishingLive: z.boolean(),
	approvalPolicy: z.string(),
});

export const updateAutomationConfigInput = z.object({
	businessUnitId,
	mode: automationMode.optional(),
	mediaCooldownDays: z.number().int().min(0).max(90).optional(),
	paused: z.boolean().optional(),
});

// B — upcoming content plan
export const automationPlanInput = z.object({
	businessUnitId,
	from: dateTimeString.optional(),
	to: dateTimeString.optional(),
	status: automationContentStatus.optional(),
});

export const automationPlanItemOutput = z.object({
	id: z.string(),
	title: z.string(),
	type: z.nativeEnum(MarketingContentType),
	status: z.nativeEnum(MarketingContentStatus),
	platforms: z.array(z.string()),
	service: z.string().nullable(),
	campaignId: z.string().nullable(),
	scheduledAt: z.string().nullable(),
	automationMode: automationMode,
	selectedDriveAssetId: z.string().nullable(),
	updatedAt: z.string(),
});

export const automationPlanOutput = z.object({
	rows: z.array(automationPlanItemOutput),
});

// C — create/update content item
export const automationUpsertContentInput = z.object({
	businessUnitId,
	id: z.string().trim().min(1).optional(),
	externalKey: idempotencyKey.optional(),
	campaignId: z.string().trim().min(1).nullish(),
	title: z.string().trim().min(1).max(200),
	type: z.nativeEnum(MarketingContentType).optional(),
	platforms: z.array(marketingPlatform).max(12).optional(),
	service: serviceName.nullish(),
	scheduledAt: dateTimeString.nullish(),
	status: z
		.enum([
			MarketingContentStatus.DRAFT,
			MarketingContentStatus.PLANNED,
			MarketingContentStatus.CANCELLED,
		])
		.optional(),
	automationMode: automationMode.nullish(),
	internalNotes: z.string().max(4000).nullish(),
});

export const automationContentOutput = z.object({
	id: z.string(),
	externalKey: z.string().nullable(),
	title: z.string(),
	status: z.nativeEnum(MarketingContentStatus),
	service: z.string().nullable(),
	scheduledAt: z.string().nullable(),
	automationMode: automationMode,
	created: z.boolean(),
});

// D — request approved-media selection
export const mediaSelectionRequestInput = z.object({
	businessUnitId,
	contentId,
	service: serviceName.optional(),
	mediaKind: z.nativeEnum(DriveMediaKind).optional(),
});

export const driveAssetOutput = z.object({
	id: z.string(),
	driveFileId: z.string(),
	fileName: z.string(),
	mimeType: z.string(),
	mediaKind: z.nativeEnum(DriveMediaKind),
	service: z.string().nullable(),
	folderName: z.string().nullable(),
	approvalState: driveApprovalState,
	lastUsedAt: z.string().nullable(),
	timesUsed: z.number(),
	doNotUseUntil: z.string().nullable(),
});

export const mediaSelectionOutput = z.object({
	contentId: z.string(),
	service: z.string().nullable(),
	requirements: z.object({
		service: z.string().nullable(),
		mediaKind: z.nativeEnum(DriveMediaKind).nullable(),
		cooldownDays: z.number(),
	}),
	selected: driveAssetOutput.nullable(),
	reason: z.string().nullable(),
});

// E — register Drive asset
export const registerDriveAssetInput = z.object({
	businessUnitId,
	driveFileId: z.string().trim().min(1).max(200),
	fileName: z.string().trim().min(1).max(300),
	mimeType: z.string().trim().min(1).max(120),
	mediaKind: z.nativeEnum(DriveMediaKind).optional(),
	service: serviceName.nullish(),
	folderName: z.string().trim().max(300).nullish(),
	approvalState: driveApprovalState.optional(),
	doNotUseUntil: dateTimeString.nullish(),
});

// F — save generated caption/copy
export const saveCopyInput = z.object({
	businessUnitId,
	contentId,
	caption: z.string().min(1).max(20000),
	headline: z.string().trim().max(300).nullish(),
	cta: z.string().trim().max(120).nullish(),
	hashtags: hashtagList.optional(),
	idempotencyKey,
});

// G — save rendered Canva/design asset
export const saveRenderInput = z.object({
	businessUnitId,
	contentId,
	templateId: z.string().trim().min(1).max(200),
	format: z.string().trim().min(1).max(60),
	platform: z.string().trim().min(1).max(40),
	service: serviceName.nullish(),
	sourceAssetId: z.string().trim().min(1).nullish(),
	headline: z.string().trim().max(300).nullish(),
	body: z.string().max(20000).nullish(),
	cta: z.string().trim().max(120).nullish(),
	renderedUrl: z.string().trim().url().max(1000).nullish(),
	designId: z.string().trim().max(200).nullish(),
	status: canvaRenderStatus,
	error: z.string().trim().max(500).nullish(),
	idempotencyKey,
});

export const canvaRenderOutput = z.object({
	id: z.string(),
	contentId: z.string(),
	templateId: z.string(),
	format: z.string(),
	platform: z.string(),
	sourceAssetId: z.string().nullable(),
	renderedUrl: z.string().nullable(),
	designId: z.string().nullable(),
	status: canvaRenderStatus,
	error: z.string().nullable(),
	createdAt: z.string(),
});

// H — send content for approval
export const sendApprovalInput = z.object({
	businessUnitId,
	contentId,
	summary: z.string().trim().max(500).optional(),
});

// I — read approval status
export const approvalStatusInput = z.object({
	businessUnitId,
	contentId,
});

export const approvalStatusOutput = z.object({
	contentId: z.string(),
	contentStatus: z.nativeEnum(MarketingContentStatus),
	mode: automationMode,
	approval: z
		.object({
			id: z.string(),
			status: z.enum([
				"PENDING",
				"APPROVED",
				"REJECTED",
				"EXPIRED",
				"CANCELLED",
			]),
			decidedAt: z.string().nullable(),
			note: z.string().nullable(),
		})
		.nullable(),
});

// J — mark content approved/rejected
export const decideApprovalInput = z.object({
	businessUnitId,
	contentId,
	decision: z.enum(["APPROVE", "REJECT"]),
	note: z.string().trim().max(1000).optional(),
	actor: z.enum(["USER", "AUTOPILOT"]).default("USER"),
});

// K — record publishing result (terminal)
export const publishResultInput = z.object({
	businessUnitId,
	contentId,
	socialPostId: z.string().trim().min(1).nullish(),
	platform: z.string().trim().min(1).max(40),
	accountId: z.string().trim().min(1).nullish(),
	success: z.boolean(),
	externalPostId: z.string().trim().max(300).nullish(),
	externalPostUrl: z.string().trim().url().max(1000).nullish(),
	providerRequestId: z.string().trim().max(300).nullish(),
	errorCategory: publishErrorCategory.nullish(),
	errorSummary: z
		.string()
		.trim()
		.max(MARKETING_AUTOMATION.publishErrorSummaryMaxChars)
		.nullish(),
	publishedAt: dateTimeString.nullish(),
	scheduledAt: dateTimeString.nullish(),
	attemptNo: z.number().int().min(1).max(20).default(1),
	retryCount: z.number().int().min(0).max(20).default(0),
	idempotencyKey,
});

// L — record platform post IDs/URLs
export const recordPostIdsInput = z.object({
	businessUnitId,
	socialPostId: z.string().trim().min(1),
	accountId: z.string().trim().min(1).nullish(),
	externalPostId: z.string().trim().min(1).max(300),
	externalPostUrl: z.string().trim().url().max(1000).nullish(),
});

// M — record failure/retry information (non-terminal)
export const recordFailureInput = z.object({
	businessUnitId,
	contentId,
	socialPostId: z.string().trim().min(1).nullish(),
	platform: z.string().trim().min(1).max(40),
	errorCategory: publishErrorCategory,
	errorSummary: z
		.string()
		.trim()
		.min(1)
		.max(MARKETING_AUTOMATION.publishErrorSummaryMaxChars),
	retryCount: z.number().int().min(0).max(20).default(0),
	willRetry: z.boolean().default(false),
	idempotencyKey,
});

export const publishAttemptOutput = z.object({
	id: z.string(),
	contentId: z.string().nullable(),
	socialPostId: z.string().nullable(),
	platform: z.string(),
	success: z.boolean(),
	externalPostId: z.string().nullable(),
	externalPostUrl: z.string().nullable(),
	errorCategory: publishErrorCategory.nullable(),
	errorSummary: z.string().nullable(),
	publishedAt: z.string().nullable(),
	idempotencyKey: z.string(),
	replayed: z.boolean(),
});

// N — save analytics metrics
export const saveMetricsInput = z.object({
	businessUnitId,
	contentId,
	platform: z.string().trim().min(1).max(40),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
	impressions: z.number().int().min(0).default(0),
	reach: z.number().int().min(0).default(0),
	likes: z.number().int().min(0).default(0),
	comments: z.number().int().min(0).default(0),
	shares: z.number().int().min(0).default(0),
	clicks: z.number().int().min(0).default(0),
});

export const metricOutput = z.object({
	contentId: z.string(),
	platform: z.string(),
	date: z.string(),
	impressions: z.number(),
	reach: z.number(),
	likes: z.number(),
	comments: z.number(),
	shares: z.number(),
	clicks: z.number(),
});

// O — save asset usage
export const recordUsageInput = z.object({
	businessUnitId,
	assetId: z.string().trim().min(1).optional(),
	driveFileId: z.string().trim().min(1).max(200).optional(),
	contentId: z.string().trim().min(1).nullish(),
	socialPostId: z.string().trim().min(1).nullish(),
	context: z.string().trim().max(200).nullish(),
	idempotencyKey,
});

// P — Business Brain context
export const brainContextInput = z.object({
	businessUnitId,
	service: serviceName.optional(),
});

export const brainContextOutput = z.object({
	generatedAt: z.string(),
	service: z.string().nullable(),
	offers: z.array(
		z.object({ subject: z.string(), detail: z.string().nullable() }),
	),
	pricing: z.array(
		z.object({ subject: z.string(), detail: z.string().nullable() }),
	),
	services: z.array(
		z.object({ subject: z.string(), detail: z.string().nullable() }),
	),
	faq: z.array(
		z.object({ subject: z.string(), detail: z.string().nullable() }),
	),
	bookingTrends: z.object({
		windowDays: z.number(),
		totalBookings: z.number(),
		upcomingBookings: z.number(),
	}),
});

export type AutomationConfigOutput = z.infer<typeof automationConfigOutput>;
export type AutomationPlanInput = z.input<typeof automationPlanInput>;
export type AutomationUpsertContentInput = z.input<
	typeof automationUpsertContentInput
>;
export type MediaSelectionRequestInput = z.input<
	typeof mediaSelectionRequestInput
>;
export type RegisterDriveAssetInput = z.input<typeof registerDriveAssetInput>;
export type SaveCopyInput = z.input<typeof saveCopyInput>;
export type SaveRenderInput = z.input<typeof saveRenderInput>;
export type SendApprovalInput = z.input<typeof sendApprovalInput>;
export type ApprovalStatusInput = z.input<typeof approvalStatusInput>;
export type DecideApprovalInput = z.input<typeof decideApprovalInput>;
export type PublishResultInput = z.input<typeof publishResultInput>;
export type RecordPostIdsInput = z.input<typeof recordPostIdsInput>;
export type RecordFailureInput = z.input<typeof recordFailureInput>;
export type SaveMetricsInput = z.input<typeof saveMetricsInput>;
export type RecordUsageInput = z.input<typeof recordUsageInput>;
export type BrainContextInput = z.input<typeof brainContextInput>;
export type UpdateAutomationConfigInput = z.input<
	typeof updateAutomationConfigInput
>;
