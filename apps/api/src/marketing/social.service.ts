import { createHash } from "node:crypto";
import {
	ApprovalRequestStatus,
	ApprovalRiskLevel,
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	Prisma,
	SocialAccountStatus,
	SocialPostStatus,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import {
	type AccountOutput,
	type CreatePostInput,
	type DecidePostInput,
	type ListPostsInput,
	type PostOutput,
	PROVIDER_CAPABILITIES,
	type RegisterAccountInput,
	type SchedulePostInput,
	SOCIAL_PUBLISH_APPROVAL_TYPE,
	type SocialCalendarInput,
} from "./social.contracts";

@Injectable()
export class MarketingSocialService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async listAccounts(source: BusinessContextSource) {
		const context = await resolveBusinessContext(this.db, source);
		const rows = await this.db.socialAccount.findMany({
			where: {
				businessUnitId: context.businessUnitId,
				archivedAt: null,
			},
			orderBy: [{ createdAt: "asc" }],
		});

		return { rows: rows.map(serializeAccount) };
	}

	async registerAccount(
		source: BusinessContextSource,
		input: RegisterAccountInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const capability = PROVIDER_CAPABILITIES[input.provider];
		if (!capability.publishing) {
			throw new BadRequestException(
				`${capability.label} is not supported yet. The provider architecture is in place, but this channel is not verified for connection.`,
			);
		}

		const row = await this.db.socialAccount.upsert({
			where: {
				businessUnitId_provider_externalAccountId: {
					businessUnitId: context.businessUnitId,
					provider: input.provider,
					externalAccountId: input.externalAccountId,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				provider: input.provider,
				externalAccountId: input.externalAccountId,
				displayName: input.displayName,
				handle: input.handle ?? null,
				scopes: input.scopes ?? [],
				credentials: { accessToken: input.accessToken },
				status: SocialAccountStatus.CONNECTED,
				createdById: source.userId,
			},
			update: {
				displayName: input.displayName,
				handle: input.handle ?? null,
				scopes: input.scopes ?? [],
				credentials: { accessToken: input.accessToken },
				status: SocialAccountStatus.CONNECTED,
				archivedAt: null,
			},
		});

		return serializeAccount(row);
	}

	async disconnectAccount(
		source: BusinessContextSource,
		input: { id: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const account = await this.db.socialAccount.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true },
		});
		if (!account) throw new NotFoundException("Social account not found.");

		const row = await this.db.socialAccount.update({
			where: { id: account.id },
			data: {
				status: SocialAccountStatus.DISCONNECTED,
				credentials: Prisma.DbNull,
			},
		});

		return serializeAccount(row);
	}

	async listPosts(source: BusinessContextSource, input: ListPostsInput) {
		const context = await resolveBusinessContext(this.db, source);
		const where: Prisma.SocialPostWhereInput = {
			businessUnitId: context.businessUnitId,
			status: input.status,
		};
		if (input.from || input.to) {
			where.scheduledAt = {
				gte: input.from ? new Date(input.from) : undefined,
				lte: input.to ? new Date(input.to) : undefined,
			};
		}
		const rows = await this.db.socialPost.findMany({
			where,
			include: {
				targets: { include: { account: true } },
			},
			orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
			take: 300,
		});

		return { rows: rows.map(serializePost) };
	}

	async createPost(source: BusinessContextSource, input: CreatePostInput) {
		const context = await resolveBusinessContext(this.db, source);

		const accounts = await this.db.socialAccount.findMany({
			where: {
				id: { in: input.accountIds },
				businessUnitId: context.businessUnitId,
				archivedAt: null,
				status: { not: SocialAccountStatus.DISCONNECTED },
			},
			select: { id: true, provider: true },
		});
		if (accounts.length !== input.accountIds.length) {
			throw new BadRequestException(
				"One or more accounts are missing or disconnected.",
			);
		}
		for (const account of accounts) {
			if (!PROVIDER_CAPABILITIES[account.provider].publishing) {
				throw new BadRequestException(
					`${PROVIDER_CAPABILITIES[account.provider].label} cannot be published to yet.`,
				);
			}
		}

		if (input.contentId) {
			const content = await this.db.marketingContent.findFirst({
				where: { id: input.contentId, businessUnitId: context.businessUnitId },
				select: { id: true },
			});
			if (!content) throw new NotFoundException("Content not found.");
		}
		if (input.campaignId) {
			const campaign = await this.db.marketingCampaign.findFirst({
				where: { id: input.campaignId, businessUnitId: context.businessUnitId },
				select: { id: true },
			});
			if (!campaign) throw new NotFoundException("Campaign not found.");
		}

		const key =
			input.idempotencyKey ??
			defaultIdempotencyKey(context.businessUnitId, input);

		const existing = await this.db.socialPost.findUnique({
			where: { idempotencyKey: key },
			include: { targets: { include: { account: true } } },
		});
		if (existing) return serializePost(existing);

		const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
		const row = await this.db.socialPost.create({
			data: {
				businessUnitId: context.businessUnitId,
				contentId: input.contentId ?? null,
				campaignId: input.campaignId ?? null,
				caption: input.caption,
				mediaUrls: input.mediaUrls ?? [],
				status: SocialPostStatus.DRAFT,
				scheduledAt,
				idempotencyKey: key,
				createdById: source.userId,
				targets: {
					create: input.accountIds.map((accountId) => ({ accountId })),
				},
			},
			include: { targets: { include: { account: true } } },
		});

		return serializePost(row);
	}

	async submitForApproval(
		source: BusinessContextSource,
		input: { id: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			include: { targets: { include: { account: true } } },
		});
		if (!post) throw new NotFoundException("Social post not found.");
		if (
			post.status !== SocialPostStatus.DRAFT &&
			post.status !== SocialPostStatus.CANCELLED
		) {
			throw new BadRequestException(
				"Only draft or cancelled posts can go to approval.",
			);
		}
		if (post.targets.length === 0) {
			throw new BadRequestException("The post has no target accounts.");
		}

		const result = await this.db.$transaction(async (tx) => {
			const updated = await tx.socialPost.update({
				where: { id: post.id },
				data: {
					status: SocialPostStatus.PENDING_APPROVAL,
					requestedAt: new Date(),
				},
				include: { targets: { include: { account: true } } },
			});

			const approval = await tx.approvalRequest.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: SOCIAL_PUBLISH_APPROVAL_TYPE,
					summary: `Approve social post: ${post.caption.slice(0, 80)}`,
					proposedAction: {
						kind: SOCIAL_PUBLISH_APPROVAL_TYPE,
						socialPostId: post.id,
						accounts: post.targets.map((target) => target.account.displayName),
					},
					riskLevel: ApprovalRiskLevel.HIGH,
					metadata: {
						socialPostId: post.id,
						requiresHumanApproval: true,
					},
				},
				select: { id: true },
			});

			await tx.businessEvent.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: "marketing.social.publish_requested",
					source: BusinessEventSource.SYSTEM,
					channel: CommunicationChannel.INTERNAL,
					occurredAt: new Date(),
					data: {
						socialPostId: post.id,
						approvalRequestId: approval.id,
					},
					correlationId: approval.id,
					idempotencyKey: `marketing:social-approval:${post.id}:${approval.id}`,
				},
			});

			return { updated, approvalRequestId: approval.id };
		});

		return {
			post: serializePost(result.updated),
			approvalRequestId: result.approvalRequestId,
		};
	}

	async decide(source: BusinessContextSource, input: DecidePostInput) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!post) throw new NotFoundException("Social post not found.");
		if (post.status !== SocialPostStatus.PENDING_APPROVAL) {
			throw new BadRequestException("This post is not waiting for approval.");
		}

		const approved = input.decision === "APPROVE";

		const row = await this.db.$transaction(async (tx) => {
			const updated = await tx.socialPost.update({
				where: { id: post.id },
				data: {
					status: approved
						? post.scheduledAt
							? SocialPostStatus.SCHEDULED
							: SocialPostStatus.APPROVED
						: SocialPostStatus.DRAFT,
					approvedById: approved ? source.userId : null,
					approvedAt: approved ? new Date() : null,
				},
				include: { targets: { include: { account: true } } },
			});

			const pending = await tx.approvalRequest.findFirst({
				where: {
					businessUnitId: context.businessUnitId,
					type: SOCIAL_PUBLISH_APPROVAL_TYPE,
					status: ApprovalRequestStatus.PENDING,
					metadata: { path: ["socialPostId"], equals: post.id },
				},
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});

			if (pending) {
				await tx.approvalRequest.update({
					where: { id: pending.id },
					data: {
						status: approved
							? ApprovalRequestStatus.APPROVED
							: ApprovalRequestStatus.REJECTED,
						approvedById: approved ? source.userId : null,
						approvedAt: approved ? new Date() : null,
						rejectedAt: approved ? null : new Date(),
					},
				});
			}

			await tx.businessEvent.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: "marketing.social.publish_decided",
					source: BusinessEventSource.SYSTEM,
					channel: CommunicationChannel.INTERNAL,
					occurredAt: new Date(),
					data: {
						socialPostId: post.id,
						decision: input.decision,
						note: input.note ?? null,
					},
					correlationId: pending?.id ?? post.id,
					idempotencyKey: `marketing:social-decision:${post.id}:${updated.updatedAt.getTime()}`,
				},
			});

			return updated;
		});

		return serializePost(row);
	}

	async schedule(source: BusinessContextSource, input: SchedulePostInput) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true, status: true },
		});
		if (!post) throw new NotFoundException("Social post not found.");
		if (post.status !== SocialPostStatus.APPROVED) {
			throw new BadRequestException("Only approved posts can be scheduled.");
		}

		const scheduledAt = new Date(input.scheduledAt);
		if (Number.isNaN(scheduledAt.getTime())) {
			throw new BadRequestException("The schedule time is invalid.");
		}

		const row = await this.db.socialPost.update({
			where: { id: post.id },
			data: { status: SocialPostStatus.SCHEDULED, scheduledAt },
			include: { targets: { include: { account: true } } },
		});

		return serializePost(row);
	}

	async publish(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			include: { targets: { include: { account: true } } },
		});
		if (!post) throw new NotFoundException("Social post not found.");
		if (
			post.status !== SocialPostStatus.APPROVED &&
			post.status !== SocialPostStatus.SCHEDULED
		) {
			throw new BadRequestException(
				"Publishing requires an approved post. Approval is the default policy.",
			);
		}
		const unverified = post.targets.filter(
			(target) => !PROVIDER_CAPABILITIES[target.account.provider].docsVerified,
		);
		if (unverified.length > 0) {
			throw new BadRequestException(
				"Publishing is not available: the provider documentation for these accounts has not been verified, so no calls are made. The post stays approved.",
			);
		}

		throw new BadRequestException(
			"Autopilot publishing is disabled in this milestone. n8n will execute approved posts through provider APIs in a later phase.",
		);
	}

	async cancel(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true, status: true },
		});
		if (!post) throw new NotFoundException("Social post not found.");
		if (
			post.status === SocialPostStatus.PUBLISHED ||
			post.status === SocialPostStatus.PUBLISHING
		) {
			throw new BadRequestException("Published posts cannot be cancelled.");
		}

		const row = await this.db.socialPost.update({
			where: { id: post.id },
			data: { status: SocialPostStatus.CANCELLED },
			include: { targets: { include: { account: true } } },
		});

		return serializePost(row);
	}

	async calendar(source: BusinessContextSource, input: SocialCalendarInput) {
		const context = await resolveBusinessContext(this.db, source);
		const from = new Date(input.from);
		const to = new Date(input.to);

		const [posts, contents, campaigns] = await Promise.all([
			this.db.socialPost.findMany({
				where: {
					businessUnitId: context.businessUnitId,
					scheduledAt: { gte: from, lte: to },
					status: {
						notIn: [SocialPostStatus.CANCELLED, SocialPostStatus.DRAFT],
					},
				},
				include: { targets: { include: { account: true } } },
			}),
			this.db.marketingContent.findMany({
				where: {
					businessUnitId: context.businessUnitId,
					scheduledAt: { gte: from, lte: to },
					archivedAt: null,
				},
				include: {
					media: {
						orderBy: { position: "asc" },
						take: 1,
						include: { asset: true },
					},
				},
			}),
			this.db.marketingCampaign.findMany({
				where: {
					businessUnitId: context.businessUnitId,
					status: {
						in: ["PLANNED", "ACTIVE", "PAUSED"],
					},
					OR: [
						{ startDate: { gte: from, lte: to } },
						{ endDate: { gte: from, lte: to } },
						{ startDate: { lte: from }, endDate: { gte: to } },
					],
				},
			}),
		]);

		const items = [
			...posts.map((post) => ({
				kind: "SOCIAL_POST" as const,
				id: post.id,
				title: post.caption.slice(0, 120),
				status: post.status,
				at: post.scheduledAt?.toISOString() ?? post.createdAt.toISOString(),
				endAt: null,
				platforms: post.targets.map((target) => target.account.provider),
				campaignId: post.campaignId,
				mediaUrl: firstMediaUrl(post.mediaUrls),
			})),
			...contents.map((content) => ({
				kind: "CONTENT" as const,
				id: content.id,
				title: content.title,
				status: content.status,
				at:
					content.scheduledAt?.toISOString() ?? content.createdAt.toISOString(),
				endAt: null,
				platforms: parsePlatforms(content.platforms),
				campaignId: content.campaignId,
				mediaUrl: content.media[0]?.asset.blobUrl ?? null,
			})),
			...campaigns.flatMap((campaign) => {
				if (!campaign.startDate && !campaign.endDate) return [];
				return [
					{
						kind: "CAMPAIGN" as const,
						id: campaign.id,
						title: campaign.name,
						status: campaign.status,
						at: (
							campaign.startDate ??
							campaign.endDate ??
							campaign.createdAt
						).toISOString(),
						endAt: campaign.endDate?.toISOString() ?? null,
						platforms: parsePlatforms(campaign.channels),
						campaignId: campaign.id,
						mediaUrl: null,
					},
				];
			}),
		];

		items.sort((a, b) => a.at.localeCompare(b.at));

		return { items };
	}

	async inbox(source: BusinessContextSource) {
		const context = await resolveBusinessContext(this.db, source);
		const accounts = await this.db.socialAccount.findMany({
			where: {
				businessUnitId: context.businessUnitId,
				archivedAt: null,
				status: SocialAccountStatus.CONNECTED,
			},
			select: { provider: true },
		});
		const available = accounts.some(
			(account) => PROVIDER_CAPABILITIES[account.provider].inbox.length > 0,
		);

		const rows = await this.db.socialInteraction.findMany({
			where: { businessUnitId: context.businessUnitId },
			include: { account: true },
			orderBy: [{ occurredAt: "desc" }],
			take: 100,
		});

		return {
			available,
			rows: rows.map((row) => ({
				id: row.id,
				accountId: row.accountId,
				accountName: row.account.displayName,
				kind: row.kind,
				authorName: row.authorName,
				text: row.text,
				occurredAt: row.occurredAt.toISOString(),
				status: row.status,
			})),
		};
	}
}

function defaultIdempotencyKey(
	businessUnitId: string,
	input: CreatePostInput,
): string {
	const digest = createHash("sha256")
		.update(
			JSON.stringify({
				caption: input.caption,
				mediaUrls: input.mediaUrls ?? [],
				accountIds: [...input.accountIds].sort(),
				contentId: input.contentId ?? null,
			}),
		)
		.digest("hex")
		.slice(0, 16);
	return `social-post:${businessUnitId}:${digest}`;
}

function firstMediaUrl(value: Prisma.JsonValue): string | null {
	const parsed = z.array(z.string()).safeParse(value);
	return parsed.success ? (parsed.data[0] ?? null) : null;
}

function parsePlatforms(value: Prisma.JsonValue): string[] {
	const parsed = z.array(z.string()).safeParse(value);
	return parsed.success ? parsed.data : [];
}

type AccountRow = Prisma.SocialAccountGetPayload<object>;

function serializeAccount(account: AccountRow): AccountOutput {
	const capability = PROVIDER_CAPABILITIES[account.provider];
	return {
		id: account.id,
		provider: account.provider,
		providerLabel: capability.label,
		externalAccountId: account.externalAccountId,
		displayName: account.displayName,
		handle: account.handle,
		scopes: parsePlatforms(account.scopes),
		status: account.status,
		connectedAt: account.connectedAt.toISOString(),
		lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
		publishing: capability.publishing,
		docsVerified: capability.docsVerified,
	};
}

type PostRow = Prisma.SocialPostGetPayload<{
	include: { targets: { include: { account: true } } };
}>;

function serializePost(post: PostRow): PostOutput {
	return {
		id: post.id,
		campaignId: post.campaignId,
		contentId: post.contentId,
		caption: post.caption,
		mediaUrls: parsePlatforms(post.mediaUrls),
		status: post.status,
		scheduledAt: post.scheduledAt?.toISOString() ?? null,
		requestedAt: post.requestedAt?.toISOString() ?? null,
		publishedAt: post.publishedAt?.toISOString() ?? null,
		providerPostId: post.providerPostId,
		error: post.error,
		idempotencyKey: post.idempotencyKey,
		approvedById: post.approvedById,
		approvedAt: post.approvedAt?.toISOString() ?? null,
		targets: post.targets.map((target) => ({
			accountId: target.accountId,
			accountName: target.account.displayName,
			provider: target.account.provider,
			status: target.status,
			providerPostId: target.providerPostId,
			publishedAt: target.publishedAt?.toISOString() ?? null,
			error: target.error,
		})),
		createdAt: post.createdAt.toISOString(),
	};
}
