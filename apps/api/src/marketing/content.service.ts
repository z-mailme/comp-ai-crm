import {
	ApprovalRequestStatus,
	ApprovalRiskLevel,
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	MarketingContentStatus,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import {
	CONTENT_APPROVAL_TYPE,
	type ContentOutput,
	type ContentSuggestionOutput,
	type CreateContentInput,
	contentSuggestionOutput,
	type DecideContentInput,
	type ListContentInput,
	marketingPlatform,
	type ScheduleContentInput,
	type UpdateContentInput,
} from "./content.contracts";

@Injectable()
export class MarketingContentService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(source: BusinessContextSource, input: ListContentInput) {
		const context = await resolveBusinessContext(this.db, source);
		const where: Prisma.MarketingContentWhereInput = {
			businessUnitId: context.businessUnitId,
			archivedAt: null,
			status: input.status,
			type: input.type,
			campaignId: input.campaignId,
		};
		if (input.query) {
			where.title = { contains: input.query, mode: "insensitive" };
		}
		const rows = await this.db.marketingContent.findMany({
			where,
			orderBy: [{ updatedAt: "desc" }],
			take: 200,
		});

		return { rows: rows.map(serialize) };
	}

	async byId(
		source: BusinessContextSource,
		input: { businessUnitId?: string; id: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!content) throw new NotFoundException("Content not found.");
		return serialize(content);
	}

	async detail(
		source: BusinessContextSource,
		input: { businessUnitId?: string; id: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			include: {
				campaign: { select: { name: true } },
				media: {
					orderBy: { position: "asc" },
					include: { asset: true },
				},
			},
		});
		if (!content) throw new NotFoundException("Content not found.");

		return {
			content: serialize(content),
			media: content.media.map((entry) => ({
				assetId: entry.assetId,
				position: entry.position,
				fileName: entry.asset.fileName,
				mimeType: entry.asset.mimeType,
				sizeBytes: entry.asset.sizeBytes,
				width: entry.asset.width,
				height: entry.asset.height,
				blobUrl: entry.asset.blobUrl,
			})),
			campaignName: content.campaign?.name ?? null,
		};
	}

	async create(source: BusinessContextSource, input: CreateContentInput) {
		const context = await resolveBusinessContext(this.db, source);
		if (input.campaignId)
			await this.requireCampaign(context.businessUnitId, input.campaignId);

		const row = await this.db.marketingContent.create({
			data: {
				businessUnitId: context.businessUnitId,
				campaignId: input.campaignId ?? null,
				title: input.title,
				type: input.type,
				platforms: input.platforms ?? [],
				caption: input.caption ?? null,
				headline: input.headline ?? null,
				cta: input.cta ?? null,
				link: input.link ?? null,
				hashtags: input.hashtags ?? [],
				internalNotes: input.internalNotes ?? null,
				ownerId: source.userId,
				createdById: source.userId,
			},
		});

		return serialize(row);
	}

	async update(source: BusinessContextSource, input: UpdateContentInput) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true, status: true },
		});
		if (!existing) throw new NotFoundException("Content not found.");
		if (
			existing.status === MarketingContentStatus.PUBLISHED ||
			existing.status === MarketingContentStatus.ARCHIVED
		) {
			throw new BadRequestException(
				"Published or archived content cannot be edited.",
			);
		}
		if (input.campaignId) {
			await this.requireCampaign(context.businessUnitId, input.campaignId);
		}

		const data: Prisma.MarketingContentUpdateInput = {};
		if (input.campaignId !== undefined)
			data.campaign = input.campaignId
				? { connect: { id: input.campaignId } }
				: { disconnect: true };
		if (input.title !== undefined) data.title = input.title;
		if (input.type !== undefined) data.type = input.type;
		if (input.platforms !== undefined) data.platforms = input.platforms;
		if (input.caption !== undefined) data.caption = input.caption;
		if (input.headline !== undefined) data.headline = input.headline;
		if (input.cta !== undefined) data.cta = input.cta;
		if (input.link !== undefined) data.link = input.link;
		if (input.hashtags !== undefined) data.hashtags = input.hashtags;
		if (input.internalNotes !== undefined)
			data.internalNotes = input.internalNotes;

		const row = await this.db.marketingContent.update({
			where: { id: existing.id },
			data,
		});

		return serialize(row);
	}

	async duplicate(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			include: { media: true },
		});
		if (!existing) throw new NotFoundException("Content not found.");

		const row = await this.db.marketingContent.create({
			data: {
				businessUnitId: existing.businessUnitId,
				campaignId: existing.campaignId,
				title: `${existing.title} (copy)`,
				type: existing.type,
				platforms: parsePlatforms(existing.platforms),
				caption: existing.caption,
				headline: existing.headline,
				cta: existing.cta,
				link: existing.link,
				hashtags: parseHashtags(existing.hashtags),
				internalNotes: existing.internalNotes,
				ownerId: source.userId,
				createdById: source.userId,
				media: {
					create: existing.media.map((entry) => ({
						assetId: entry.assetId,
						position: entry.position,
					})),
				},
			},
		});

		return serialize(row);
	}

	async archive(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true, status: true },
		});
		if (!existing) throw new NotFoundException("Content not found.");
		if (existing.status === MarketingContentStatus.PUBLISHED) {
			throw new BadRequestException("Published content cannot be archived.");
		}

		const row = await this.db.marketingContent.update({
			where: { id: existing.id },
			data: {
				status: MarketingContentStatus.ARCHIVED,
				archivedAt: new Date(),
			},
		});

		return serialize(row);
	}

	async submitForReview(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!content) throw new NotFoundException("Content not found.");
		if (
			content.status !== MarketingContentStatus.DRAFT &&
			content.status !== MarketingContentStatus.IDEA &&
			content.status !== MarketingContentStatus.REJECTED
		) {
			throw new BadRequestException(
				"Only draft or rejected content can be sent for review.",
			);
		}

		const approval = await this.db.$transaction(async (tx) => {
			const updated = await tx.marketingContent.update({
				where: { id: content.id },
				data: { status: MarketingContentStatus.READY_FOR_REVIEW },
			});

			const request = await tx.approvalRequest.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: CONTENT_APPROVAL_TYPE,
					summary: `Review content: ${content.title}`,
					proposedAction: {
						kind: CONTENT_APPROVAL_TYPE,
						contentId: content.id,
						title: content.title,
					},
					riskLevel: ApprovalRiskLevel.MEDIUM,
					metadata: { contentId: content.id, requiresHumanApproval: true },
				},
				select: { id: true },
			});

			await tx.businessEvent.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: "marketing.content.review_requested",
					source: BusinessEventSource.SYSTEM,
					channel: CommunicationChannel.INTERNAL,
					occurredAt: new Date(),
					data: {
						contentId: content.id,
						approvalRequestId: request.id,
					},
					correlationId: request.id,
					idempotencyKey: `marketing:content-review:${content.id}:${request.id}`,
				},
			});

			return { updated, request };
		});

		return {
			content: serialize(approval.updated),
			approvalRequestId: approval.request.id,
		};
	}

	async decide(source: BusinessContextSource, input: DecideContentInput) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!content) throw new NotFoundException("Content not found.");
		if (content.status !== MarketingContentStatus.READY_FOR_REVIEW) {
			throw new BadRequestException("This content is not waiting for review.");
		}

		const next =
			input.decision === "APPROVE"
				? MarketingContentStatus.APPROVED
				: input.decision === "REJECT"
					? MarketingContentStatus.REJECTED
					: MarketingContentStatus.DRAFT;

		const row = await this.db.$transaction(async (tx) => {
			const updated = await tx.marketingContent.update({
				where: { id: content.id },
				data: {
					status: next,
					approvedById: input.decision === "APPROVE" ? source.userId : null,
					approvedAt: input.decision === "APPROVE" ? new Date() : null,
				},
			});

			const pending = await tx.approvalRequest.findFirst({
				where: {
					businessUnitId: context.businessUnitId,
					type: CONTENT_APPROVAL_TYPE,
					status: ApprovalRequestStatus.PENDING,
					metadata: { path: ["contentId"], equals: content.id },
				},
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});

			if (pending) {
				await tx.approvalRequest.update({
					where: { id: pending.id },
					data: {
						status:
							input.decision === "APPROVE"
								? ApprovalRequestStatus.APPROVED
								: ApprovalRequestStatus.REJECTED,
						approvedById: input.decision === "APPROVE" ? source.userId : null,
						approvedAt: input.decision === "APPROVE" ? new Date() : null,
						rejectedAt: input.decision === "APPROVE" ? null : new Date(),
					},
				});
			}

			await tx.businessEvent.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: "marketing.content.review_decided",
					source: BusinessEventSource.SYSTEM,
					channel: CommunicationChannel.INTERNAL,
					occurredAt: new Date(),
					data: {
						contentId: content.id,
						decision: input.decision,
						note: input.note ?? null,
					},
					correlationId: pending?.id ?? content.id,
					idempotencyKey: `marketing:content-decision:${content.id}:${updated.updatedAt.getTime()}`,
				},
			});

			return updated;
		});

		return serialize(row);
	}

	async schedule(source: BusinessContextSource, input: ScheduleContentInput) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true, status: true },
		});
		if (!content) throw new NotFoundException("Content not found.");
		if (content.status !== MarketingContentStatus.APPROVED) {
			throw new BadRequestException("Only approved content can be scheduled.");
		}

		const scheduledAt = new Date(input.scheduledAt);
		if (Number.isNaN(scheduledAt.getTime())) {
			throw new BadRequestException("The schedule time is invalid.");
		}

		const row = await this.db.marketingContent.update({
			where: { id: content.id },
			data: {
				status: MarketingContentStatus.SCHEDULED,
				scheduledAt,
			},
		});

		return serialize(row);
	}

	async requestAiAssist(
		source: BusinessContextSource,
		input: { id: string; instruction: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true },
		});
		if (!content) throw new NotFoundException("Content not found.");

		const queued = await this.agent.marketingContentAssistRequested(
			content.id,
			context.businessUnitId,
			input.instruction,
		);

		return { queued };
	}

	private async requireCampaign(businessUnitId: string, campaignId: string) {
		const campaign = await this.db.marketingCampaign.findFirst({
			where: { id: campaignId, businessUnitId },
			select: { id: true },
		});
		if (!campaign) throw new NotFoundException("Campaign not found.");
	}
}

type ContentRow = Prisma.MarketingContentGetPayload<object>;

function serialize(content: ContentRow): ContentOutput {
	return {
		id: content.id,
		campaignId: content.campaignId,
		title: content.title,
		type: content.type,
		status: content.status,
		platforms: parsePlatforms(content.platforms),
		caption: content.caption,
		headline: content.headline,
		cta: content.cta,
		link: content.link,
		hashtags: parseHashtags(content.hashtags),
		scheduledAt: content.scheduledAt?.toISOString() ?? null,
		publishedAt: content.publishedAt?.toISOString() ?? null,
		internalNotes: content.internalNotes,
		aiAssisted: content.aiAssisted,
		aiSuggestion: parseSuggestion(content.aiSuggestion),
		listmonkCampaignId: content.listmonkCampaignId,
		ownerId: content.ownerId,
		approvedById: content.approvedById,
		approvedAt: content.approvedAt?.toISOString() ?? null,
		createdAt: content.createdAt.toISOString(),
		updatedAt: content.updatedAt.toISOString(),
	};
}

function parsePlatforms(value: Prisma.JsonValue) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const parsed = marketingPlatform.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	});
}

function parseHashtags(value: Prisma.JsonValue): string[] {
	const parsed = z.array(z.string()).safeParse(value);
	return parsed.success ? parsed.data : [];
}

function parseSuggestion(
	value: Prisma.JsonValue,
): ContentSuggestionOutput | null {
	const parsed = contentSuggestionOutput.safeParse(value);
	return parsed.success ? parsed.data : null;
}
