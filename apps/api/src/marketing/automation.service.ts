import {
	ApprovalRequestStatus,
	ApprovalRiskLevel,
	BookingStatus,
	CanvaRenderStatus,
	type Db,
	DriveAssetApprovalState,
	DriveMediaKind,
	KnowledgeKind,
	MarketingAutomationMode,
	MarketingContentStatus,
	type Prisma,
	PublishErrorCategory,
	SocialPostStatus,
	SocialPostTargetStatus,
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
import type {
	ApprovalStatusInput,
	AutomationPlanInput,
	AutomationUpsertContentInput,
	BrainContextInput,
	DecideApprovalInput,
	MediaSelectionRequestInput,
	PublishResultInput,
	RecordFailureInput,
	RecordPostIdsInput,
	RecordUsageInput,
	RegisterDriveAssetInput,
	SaveCopyInput,
	SaveMetricsInput,
	SaveRenderInput,
	SendApprovalInput,
	UpdateAutomationConfigInput,
} from "./automation.contracts";
import {
	DEFAULT_AUTOMATION_SETTINGS,
	type MarketingAutomationSettings,
	parseAutomationSettings,
	parseUnitSettings,
} from "./automation-settings";
import { CONTENT_APPROVAL_TYPE } from "./content.contracts";
import { MARKETING_AUTOMATION } from "./marketing-config";

const DAY_MS = 24 * 60 * 60 * 1000;

const ACTIVE_PIPELINE_STATUSES = [
	MarketingContentStatus.PLANNED,
	MarketingContentStatus.MEDIA_SELECTED,
	MarketingContentStatus.COPY_GENERATED,
	MarketingContentStatus.DESIGN_GENERATED,
	MarketingContentStatus.AWAITING_APPROVAL,
	MarketingContentStatus.APPROVED,
	MarketingContentStatus.SCHEDULED,
	MarketingContentStatus.PUBLISHING,
] as const;

type AutomationActor = "user" | "n8n" | "autopilot";

@Injectable()
export class MarketingAutomationService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async config(source: BusinessContextSource) {
		const context = await resolveBusinessContext(this.db, source);
		const settings = await this.settingsFor(context.businessUnitId);
		return {
			mode: settings.mode,
			autopilotEnabled: settings.autopilotEnabled,
			mediaCooldownDays: settings.mediaCooldownDays,
			planHorizonDays: MARKETING_AUTOMATION.planHorizonDays,
			services: [...MARKETING_AUTOMATION.services],
			contentTypes: [...MARKETING_AUTOMATION.contentTypes],
			platforms: ["FACEBOOK", "INSTAGRAM"],
			publishingLive: false,
			approvalPolicy:
				"APPROVAL REQUIRED. n8n prepares content; a human approves it in Comp AI before anything is published.",
		};
	}

	async updateConfig(
		source: BusinessContextSource,
		input: UpdateAutomationConfigInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const unit = await this.db.businessUnit.findUnique({
			where: { id: context.businessUnitId },
			select: { id: true, settings: true },
		});
		if (!unit) throw new NotFoundException("Business unit not found.");

		const current = await this.settingsFor(unit.id);
		const next: MarketingAutomationSettings = {
			mode: input.paused
				? MarketingAutomationMode.MANUAL
				: (input.mode ?? current.mode),
			mediaCooldownDays: input.mediaCooldownDays ?? current.mediaCooldownDays,
			autopilotEnabled: false,
		};

		const existing = parseUnitSettings(unit.settings);

		await this.db.businessUnit.update({
			where: { id: unit.id },
			data: {
				settings: {
					...existing,
					marketingAutomation: next,
				} as Prisma.InputJsonValue,
			},
		});

		await this.audit(context.businessUnitId, {
			actor: "user",
			action: "config.update",
			detail: { mode: next.mode, mediaCooldownDays: next.mediaCooldownDays },
			createdById: context.userId,
		});

		return this.config(source);
	}

	async plan(source: BusinessContextSource, input: AutomationPlanInput) {
		const context = await resolveBusinessContext(this.db, source);
		const settings = await this.settingsFor(context.businessUnitId);
		const from = input.from ? new Date(input.from) : new Date();
		const to = input.to
			? new Date(input.to)
			: new Date(
					from.getTime() + MARKETING_AUTOMATION.planHorizonDays * DAY_MS,
				);

		const rows = await this.db.marketingContent.findMany({
			where: {
				businessUnitId: context.businessUnitId,
				archivedAt: null,
				status: input.status ?? { in: [...ACTIVE_PIPELINE_STATUSES] },
				OR: [{ scheduledAt: { gte: from, lte: to } }, { scheduledAt: null }],
			},
			orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
			take: MARKETING_AUTOMATION.planListLimit,
		});

		return {
			rows: rows.map((row) => ({
				id: row.id,
				title: row.title,
				type: row.type,
				status: row.status,
				platforms: parsePlatforms(row.platforms),
				service: row.service,
				campaignId: row.campaignId,
				scheduledAt: row.scheduledAt?.toISOString() ?? null,
				automationMode: row.automationMode ?? settings.mode,
				selectedDriveAssetId: row.selectedDriveAssetId,
				updatedAt: row.updatedAt.toISOString(),
			})),
		};
	}

	async upsertContent(
		source: BusinessContextSource,
		input: AutomationUpsertContentInput,
	) {
		const context = await resolveBusinessContext(this.db, source);

		const existing = input.id
			? await this.db.marketingContent.findFirst({
					where: { id: input.id, businessUnitId: context.businessUnitId },
				})
			: input.externalKey
				? await this.db.marketingContent.findFirst({
						where: {
							businessUnitId: context.businessUnitId,
							externalKey: input.externalKey,
						},
					})
				: null;

		const data = {
			campaignId: input.campaignId ?? undefined,
			title: input.title,
			type: input.type,
			platforms: input.platforms,
			service: input.service === null ? null : input.service,
			scheduledAt:
				input.scheduledAt === null
					? null
					: input.scheduledAt
						? new Date(input.scheduledAt)
						: undefined,
			status: input.status,
			automationMode:
				input.automationMode === null ? null : input.automationMode,
			internalNotes: input.internalNotes === null ? null : input.internalNotes,
			externalKey: input.externalKey,
			aiAssisted: true,
		} satisfies Prisma.MarketingContentUncheckedUpdateInput;

		const row = existing
			? await this.db.marketingContent.update({
					where: { id: existing.id },
					data,
				})
			: await this.db.marketingContent.create({
					data: {
						...data,
						businessUnitId: context.businessUnitId,
						status: input.status ?? MarketingContentStatus.PLANNED,
					},
				});

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: existing ? "content.update" : "content.create",
			contentId: row.id,
			detail: { externalKey: input.externalKey ?? null },
		});

		const settings = await this.settingsFor(context.businessUnitId);
		return {
			id: row.id,
			externalKey: row.externalKey,
			title: row.title,
			status: row.status,
			service: row.service,
			scheduledAt: row.scheduledAt?.toISOString() ?? null,
			automationMode: row.automationMode ?? settings.mode,
			created: !existing,
		};
	}

	async requestMedia(
		source: BusinessContextSource,
		input: MediaSelectionRequestInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);
		const settings = await this.settingsFor(context.businessUnitId);
		const service = input.service ?? content.service;

		const now = new Date();
		const cooldownBefore = new Date(
			now.getTime() - settings.mediaCooldownDays * DAY_MS,
		);

		const selected = await this.db.driveMediaAsset.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				approvalState: DriveAssetApprovalState.APPROVED,
				archivedAt: null,
				service: service ?? undefined,
				mediaKind: input.mediaKind,
				OR: [{ doNotUseUntil: null }, { doNotUseUntil: { lte: now } }],
				AND: [
					{
						OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: cooldownBefore } }],
					},
				],
				selectedByContent: {
					none: { status: { in: [...ACTIVE_PIPELINE_STATUSES] } },
				},
			},
			orderBy: [
				{ timesUsed: "asc" },
				{ lastUsedAt: { sort: "asc", nulls: "first" } },
			],
		});

		if (!selected) {
			return {
				contentId: content.id,
				service,
				requirements: {
					service,
					mediaKind: input.mediaKind ?? null,
					cooldownDays: settings.mediaCooldownDays,
				},
				selected: null,
				reason:
					"No approved Drive asset is eligible. Every asset is unapproved, on cooldown, held by do_not_use_until, or already selected for content in the pipeline.",
			};
		}

		const updated = await this.db.marketingContent.update({
			where: { id: content.id },
			data: {
				selectedDriveAssetId: selected.id,
				status: statusFrom(content.status, [
					MarketingContentStatus.PLANNED,
					MarketingContentStatus.MEDIA_SELECTED,
				])
					? MarketingContentStatus.MEDIA_SELECTED
					: content.status,
			},
		});

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "media.select",
			contentId: content.id,
			detail: { assetId: selected.id, driveFileId: selected.driveFileId },
		});

		return {
			contentId: updated.id,
			service,
			requirements: {
				service,
				mediaKind: input.mediaKind ?? null,
				cooldownDays: settings.mediaCooldownDays,
			},
			selected: serializeAsset(selected),
			reason: null,
		};
	}

	async registerAsset(
		source: BusinessContextSource,
		input: RegisterDriveAssetInput,
	) {
		const context = await resolveBusinessContext(this.db, source);

		const asset = await this.db.driveMediaAsset.upsert({
			where: {
				businessUnitId_driveFileId: {
					businessUnitId: context.businessUnitId,
					driveFileId: input.driveFileId,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				driveFileId: input.driveFileId,
				fileName: input.fileName,
				mimeType: input.mimeType,
				mediaKind: input.mediaKind ?? mediaKindOf(input.mimeType),
				service: input.service ?? null,
				folderName: input.folderName ?? null,
				approvalState: input.approvalState ?? DriveAssetApprovalState.PENDING,
				doNotUseUntil: input.doNotUseUntil
					? new Date(input.doNotUseUntil)
					: null,
			},
			update: {
				fileName: input.fileName,
				mimeType: input.mimeType,
				mediaKind: input.mediaKind ?? mediaKindOf(input.mimeType),
				service: input.service ?? undefined,
				folderName: input.folderName ?? undefined,
				approvalState: input.approvalState,
				doNotUseUntil:
					input.doNotUseUntil === null
						? null
						: input.doNotUseUntil
							? new Date(input.doNotUseUntil)
							: undefined,
			},
		});

		return serializeAsset(asset);
	}

	async saveCopy(source: BusinessContextSource, input: SaveCopyInput) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);
		assertStatus(content.status, [
			MarketingContentStatus.PLANNED,
			MarketingContentStatus.MEDIA_SELECTED,
			MarketingContentStatus.COPY_GENERATED,
			MarketingContentStatus.DRAFT,
		]);

		const row = await this.db.marketingContent.update({
			where: { id: content.id },
			data: {
				caption: input.caption,
				headline: input.headline ?? undefined,
				cta: input.cta ?? undefined,
				hashtags: input.hashtags ?? undefined,
				status: MarketingContentStatus.COPY_GENERATED,
				aiAssisted: true,
			},
		});

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "content.copy",
			contentId: content.id,
			detail: { idempotencyKey: input.idempotencyKey },
		});

		return {
			id: row.id,
			externalKey: row.externalKey,
			title: row.title,
			status: row.status,
			service: row.service,
			scheduledAt: row.scheduledAt?.toISOString() ?? null,
			automationMode:
				row.automationMode ??
				(await this.settingsFor(context.businessUnitId)).mode,
			created: false,
		};
	}

	async saveRender(source: BusinessContextSource, input: SaveRenderInput) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);

		if (input.sourceAssetId) {
			const asset = await this.db.driveMediaAsset.findFirst({
				where: {
					id: input.sourceAssetId,
					businessUnitId: context.businessUnitId,
				},
			});
			if (!asset) throw new NotFoundException("Source asset not found.");
			if (asset.approvalState !== DriveAssetApprovalState.APPROVED) {
				throw new BadRequestException(
					"Source asset is not approved. Renders may only use approved media.",
				);
			}
		}

		const render = await this.db.canvaRender.upsert({
			where: { idempotencyKey: input.idempotencyKey },
			create: {
				businessUnitId: context.businessUnitId,
				contentId: content.id,
				templateId: input.templateId,
				format: input.format,
				platform: input.platform,
				service: input.service ?? content.service,
				sourceAssetId: input.sourceAssetId ?? null,
				headline: input.headline ?? content.headline,
				body: input.body ?? content.caption,
				cta: input.cta ?? content.cta,
				renderedUrl: input.renderedUrl ?? null,
				designId: input.designId ?? null,
				status: input.status,
				error: input.error ?? null,
				idempotencyKey: input.idempotencyKey,
			},
			update: {
				renderedUrl: input.renderedUrl ?? undefined,
				designId: input.designId ?? undefined,
				status: input.status,
				error: input.error ?? undefined,
			},
		});

		if (input.status === CanvaRenderStatus.READY) {
			assertStatus(content.status, [
				MarketingContentStatus.COPY_GENERATED,
				MarketingContentStatus.DESIGN_GENERATED,
			]);
			await this.db.marketingContent.update({
				where: { id: content.id },
				data: { status: MarketingContentStatus.DESIGN_GENERATED },
			});
		}

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "design.render",
			contentId: content.id,
			detail: {
				renderId: render.id,
				status: input.status,
				idempotencyKey: input.idempotencyKey,
			},
		});

		return {
			id: render.id,
			contentId: render.contentId,
			templateId: render.templateId,
			format: render.format,
			platform: render.platform,
			sourceAssetId: render.sourceAssetId,
			renderedUrl: render.renderedUrl,
			designId: render.designId,
			status: render.status,
			error: render.error,
			createdAt: render.createdAt.toISOString(),
		};
	}

	async sendApproval(source: BusinessContextSource, input: SendApprovalInput) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);
		assertStatus(content.status, [
			MarketingContentStatus.COPY_GENERATED,
			MarketingContentStatus.DESIGN_GENERATED,
			MarketingContentStatus.AWAITING_APPROVAL,
		]);

		const existing = await this.db.approvalRequest.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				type: CONTENT_APPROVAL_TYPE,
				status: ApprovalRequestStatus.PENDING,
				proposedAction: {
					path: ["contentId"],
					equals: content.id,
				},
			},
			orderBy: { createdAt: "desc" },
		});

		if (!existing) {
			await this.db.approvalRequest.create({
				data: {
					businessUnitId: context.businessUnitId,
					type: CONTENT_APPROVAL_TYPE,
					summary:
						input.summary ??
						`Approve social content "${content.title}" for publishing.`,
					proposedAction: {
						contentId: content.id,
						platforms: parsePlatforms(content.platforms),
					},
					riskLevel: ApprovalRiskLevel.MEDIUM,
					expiresAt: new Date(Date.now() + 7 * DAY_MS),
				},
			});
		}

		await this.db.marketingContent.update({
			where: { id: content.id },
			data: { status: MarketingContentStatus.AWAITING_APPROVAL },
		});

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "approval.send",
			contentId: content.id,
			detail: { deduplicated: Boolean(existing) },
		});

		return this.approvalStatus(source, { contentId: content.id });
	}

	async approvalStatus(
		source: BusinessContextSource,
		input: ApprovalStatusInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);
		const settings = await this.settingsFor(context.businessUnitId);

		const approval = await this.db.approvalRequest.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				type: CONTENT_APPROVAL_TYPE,
				proposedAction: {
					path: ["contentId"],
					equals: content.id,
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return {
			contentId: content.id,
			contentStatus: content.status,
			mode: content.automationMode ?? settings.mode,
			approval: approval
				? {
						id: approval.id,
						status: approval.status,
						decidedAt:
							approval.approvedAt?.toISOString() ??
							approval.rejectedAt?.toISOString() ??
							null,
						note: readNote(approval.metadata),
					}
				: null,
		};
	}

	async decideApproval(
		source: BusinessContextSource,
		input: DecideApprovalInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);
		const settings = await this.settingsFor(context.businessUnitId);
		const mode = content.automationMode ?? settings.mode;

		if (input.actor === "AUTOPILOT") {
			if (
				!settings.autopilotEnabled ||
				mode !== MarketingAutomationMode.FULL_AUTO
			) {
				throw new BadRequestException(
					"Autopilot decisions are disabled. Automation mode requires a human approval.",
				);
			}
		}

		const approval = await this.db.approvalRequest.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				type: CONTENT_APPROVAL_TYPE,
				status: ApprovalRequestStatus.PENDING,
				proposedAction: {
					path: ["contentId"],
					equals: content.id,
				},
			},
			orderBy: { createdAt: "desc" },
		});
		if (!approval) {
			throw new BadRequestException(
				"No pending approval request for this content.",
			);
		}

		const now = new Date();
		await this.db.approvalRequest.update({
			where: { id: approval.id },
			data: {
				status:
					input.decision === "APPROVE"
						? ApprovalRequestStatus.APPROVED
						: ApprovalRequestStatus.REJECTED,
				approvedById: input.actor === "USER" ? context.userId : null,
				approvedAt: input.decision === "APPROVE" ? now : null,
				rejectedAt: input.decision === "REJECT" ? now : null,
				metadata: { note: input.note ?? null, actor: input.actor },
			},
		});

		await this.db.marketingContent.update({
			where: { id: content.id },
			data:
				input.decision === "APPROVE"
					? {
							status: MarketingContentStatus.APPROVED,
							approvedById: input.actor === "USER" ? context.userId : null,
							approvedAt: now,
						}
					: { status: MarketingContentStatus.REJECTED },
		});

		await this.audit(context.businessUnitId, {
			actor: input.actor === "AUTOPILOT" ? "autopilot" : "user",
			action:
				input.decision === "APPROVE" ? "approval.approve" : "approval.reject",
			contentId: content.id,
			detail: { note: input.note ?? null },
			createdById: input.actor === "USER" ? context.userId : null,
		});

		return this.approvalStatus(source, { contentId: content.id });
	}

	async publishResult(
		source: BusinessContextSource,
		input: PublishResultInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);

		const replay = await this.db.socialPublishAttempt.findUnique({
			where: { idempotencyKey: input.idempotencyKey },
		});
		if (replay) {
			return serializeAttempt(replay, true);
		}

		assertStatus(content.status, [
			MarketingContentStatus.APPROVED,
			MarketingContentStatus.SCHEDULED,
			MarketingContentStatus.PUBLISHING,
			MarketingContentStatus.PUBLISHED,
			MarketingContentStatus.FAILED,
		]);

		if (content.selectedDriveAssetId) {
			const asset = await this.db.driveMediaAsset.findUnique({
				where: { id: content.selectedDriveAssetId },
			});
			if (
				!asset ||
				asset.approvalState !== DriveAssetApprovalState.APPROVED ||
				asset.archivedAt
			) {
				throw new BadRequestException(
					"Selected media is not approved. Publishing is refused.",
				);
			}
		}

		const attempt = await this.db.socialPublishAttempt.create({
			data: {
				businessUnitId: context.businessUnitId,
				contentId: content.id,
				socialPostId: input.socialPostId ?? null,
				platform: input.platform,
				accountId: input.accountId ?? null,
				scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
				attemptNo: input.attemptNo,
				providerRequestId: input.providerRequestId ?? null,
				externalPostId: input.externalPostId ?? null,
				externalPostUrl: input.externalPostUrl ?? null,
				success: input.success,
				retryCount: input.retryCount,
				errorCategory: input.errorCategory ?? null,
				errorSummary: input.errorSummary ?? null,
				publishedAt:
					input.success && input.publishedAt
						? new Date(input.publishedAt)
						: input.success
							? new Date()
							: null,
				idempotencyKey: input.idempotencyKey,
			},
		});

		await this.db.marketingContent.update({
			where: { id: content.id },
			data: input.success
				? {
						status: MarketingContentStatus.PUBLISHED,
						publishedAt: attempt.publishedAt,
					}
				: { status: MarketingContentStatus.FAILED },
		});

		if (input.socialPostId) {
			const post = await this.db.socialPost.findFirst({
				where: {
					id: input.socialPostId,
					businessUnitId: context.businessUnitId,
				},
			});
			if (post) {
				await this.db.socialPost.update({
					where: { id: post.id },
					data: input.success
						? {
								status: SocialPostStatus.PUBLISHED,
								publishedAt: attempt.publishedAt,
								providerPostId: input.externalPostId ?? post.providerPostId,
							}
						: {
								status: SocialPostStatus.FAILED,
								error: input.errorSummary ?? "Publish failed.",
							},
				});
			}
		}

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: input.success ? "publish.success" : "publish.failed",
			contentId: content.id,
			detail: {
				platform: input.platform,
				externalPostId: input.externalPostId ?? null,
				errorCategory: input.errorCategory ?? null,
				idempotencyKey: input.idempotencyKey,
			},
		});

		return serializeAttempt(attempt, false);
	}

	async recordPostIds(
		source: BusinessContextSource,
		input: RecordPostIdsInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const post = await this.db.socialPost.findFirst({
			where: { id: input.socialPostId, businessUnitId: context.businessUnitId },
			include: { targets: true },
		});
		if (!post) throw new NotFoundException("Social post not found.");

		if (input.accountId) {
			const target = post.targets.find(
				(entry) => entry.accountId === input.accountId,
			);
			if (!target) throw new NotFoundException("Post target not found.");
			if (
				target.providerPostId &&
				target.providerPostId !== input.externalPostId
			) {
				throw new BadRequestException(
					"Target already has a different external post id.",
				);
			}
			await this.db.socialPostTarget.update({
				where: { id: target.id },
				data: {
					providerPostId: input.externalPostId,
					status: SocialPostTargetStatus.PUBLISHED,
					publishedAt: target.publishedAt ?? new Date(),
				},
			});
		} else {
			if (post.providerPostId && post.providerPostId !== input.externalPostId) {
				throw new BadRequestException(
					"Post already has a different external post id.",
				);
			}
			await this.db.socialPost.update({
				where: { id: post.id },
				data: { providerPostId: input.externalPostId },
			});
		}

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "publish.post-ids",
			contentId: post.contentId,
			detail: {
				socialPostId: post.id,
				accountId: input.accountId ?? null,
				externalPostId: input.externalPostId,
				externalPostUrl: input.externalPostUrl ?? null,
			},
		});

		return { ok: true };
	}

	async recordFailure(
		source: BusinessContextSource,
		input: RecordFailureInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.requireContent(
			context.businessUnitId,
			input.contentId,
		);

		const replay = await this.db.socialPublishAttempt.findUnique({
			where: { idempotencyKey: input.idempotencyKey },
		});
		if (replay) {
			return serializeAttempt(replay, true);
		}

		const attempt = await this.db.socialPublishAttempt.create({
			data: {
				businessUnitId: context.businessUnitId,
				contentId: content.id,
				socialPostId: input.socialPostId ?? null,
				platform: input.platform,
				success: false,
				retryCount: input.retryCount,
				errorCategory: input.errorCategory,
				errorSummary: input.errorSummary,
				idempotencyKey: input.idempotencyKey,
			},
		});

		if (!input.willRetry) {
			await this.db.marketingContent.update({
				where: { id: content.id },
				data: { status: MarketingContentStatus.FAILED },
			});
		}

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "publish.retry-failure",
			contentId: content.id,
			detail: {
				platform: input.platform,
				errorCategory: input.errorCategory,
				retryCount: input.retryCount,
				willRetry: input.willRetry,
			},
		});

		return serializeAttempt(attempt, false);
	}

	async saveMetrics(source: BusinessContextSource, input: SaveMetricsInput) {
		const context = await resolveBusinessContext(this.db, source);
		await this.requireContent(context.businessUnitId, input.contentId);

		const date = new Date(`${input.date}T00:00:00.000Z`);
		const metric = await this.db.marketingContentMetric.upsert({
			where: {
				contentId_platform_date: {
					contentId: input.contentId,
					platform: input.platform,
					date,
				},
			},
			create: {
				businessUnitId: context.businessUnitId,
				contentId: input.contentId,
				platform: input.platform,
				date,
				impressions: input.impressions,
				reach: input.reach,
				likes: input.likes,
				comments: input.comments,
				shares: input.shares,
				clicks: input.clicks,
			},
			update: {
				impressions: input.impressions,
				reach: input.reach,
				likes: input.likes,
				comments: input.comments,
				shares: input.shares,
				clicks: input.clicks,
			},
		});

		return {
			contentId: metric.contentId,
			platform: metric.platform,
			date: input.date,
			impressions: metric.impressions,
			reach: metric.reach,
			likes: metric.likes,
			comments: metric.comments,
			shares: metric.shares,
			clicks: metric.clicks,
		};
	}

	async recordUsage(source: BusinessContextSource, input: RecordUsageInput) {
		const context = await resolveBusinessContext(this.db, source);
		if (!input.assetId && !input.driveFileId) {
			throw new BadRequestException("assetId or driveFileId is required.");
		}

		const asset = await this.db.driveMediaAsset.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				id: input.assetId,
				driveFileId: input.driveFileId,
			},
		});
		if (!asset) throw new NotFoundException("Drive asset not found.");

		const existing = await this.db.driveAssetUsage.findUnique({
			where: { idempotencyKey: input.idempotencyKey },
		});
		if (existing) {
			return { id: existing.id, assetId: existing.assetId, replayed: true };
		}

		const usage = await this.db.$transaction(async (tx) => {
			const row = await tx.driveAssetUsage.create({
				data: {
					assetId: asset.id,
					contentId: input.contentId ?? null,
					socialPostId: input.socialPostId ?? null,
					context: input.context ?? null,
					idempotencyKey: input.idempotencyKey,
				},
			});
			await tx.driveMediaAsset.update({
				where: { id: asset.id },
				data: {
					timesUsed: { increment: 1 },
					lastUsedAt: new Date(),
				},
			});
			return row;
		});

		await this.audit(context.businessUnitId, {
			actor: "n8n",
			action: "media.usage",
			contentId: input.contentId ?? null,
			detail: { assetId: asset.id, driveFileId: asset.driveFileId },
		});

		return { id: usage.id, assetId: usage.assetId, replayed: false };
	}

	async brainContext(source: BusinessContextSource, input: BrainContextInput) {
		const context = await resolveBusinessContext(this.db, source);
		const limits = MARKETING_AUTOMATION.brainContext;

		const knowledge = async (kind: KnowledgeKind, take: number) => {
			const rows = await this.db.businessKnowledge.findMany({
				where: {
					businessUnitId: context.businessUnitId,
					kind,
					supersededById: null,
					OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
				},
				orderBy: [{ humanConfirmed: "desc" }, { extractedAt: "desc" }],
				take,
				select: { subject: true, detail: true },
			});
			return rows.map((row) => ({ subject: row.subject, detail: row.detail }));
		};

		const trendSince = new Date(Date.now() - limits.bookingTrendDays * DAY_MS);
		const upcomingUntil = new Date(
			Date.now() + limits.upcomingBookingDays * DAY_MS,
		);
		const activeStatuses = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];

		const [offers, pricing, services, faq, totalBookings, upcomingBookings] =
			await Promise.all([
				knowledge(KnowledgeKind.RECOMMENDATION, limits.offersLimit),
				knowledge(KnowledgeKind.PRICING, limits.pricingLimit),
				knowledge(KnowledgeKind.PRODUCT_SERVICE, limits.servicesLimit),
				knowledge(KnowledgeKind.FAQ, limits.faqLimit),
				this.db.booking.count({
					where: {
						eventDate: { gte: trendSince },
						status: { in: activeStatuses },
					},
				}),
				this.db.booking.count({
					where: {
						eventDate: { gte: new Date(), lte: upcomingUntil },
						status: { in: activeStatuses },
					},
				}),
			]);

		return {
			generatedAt: new Date().toISOString(),
			service: input.service ?? null,
			offers,
			pricing,
			services,
			faq,
			bookingTrends: {
				windowDays: limits.bookingTrendDays,
				totalBookings,
				upcomingBookings,
			},
		};
	}

	private async settingsFor(
		businessUnitId: string,
	): Promise<MarketingAutomationSettings> {
		const unit = await this.db.businessUnit.findUnique({
			where: { id: businessUnitId },
			select: { settings: true },
		});
		if (!unit) return DEFAULT_AUTOMATION_SETTINGS;
		return parseAutomationSettings(unit.settings);
	}

	private async requireContent(businessUnitId: string, id: string) {
		const content = await this.db.marketingContent.findFirst({
			where: { id, businessUnitId, archivedAt: null },
		});
		if (!content) throw new NotFoundException("Content not found.");
		return content;
	}

	private async audit(
		businessUnitId: string,
		entry: {
			actor: AutomationActor;
			action: string;
			contentId?: string | null;
			detail?: Prisma.InputJsonValue;
			createdById?: string | null;
		},
	) {
		await this.db.marketingAutomationAudit.create({
			data: {
				businessUnitId,
				contentId: entry.contentId ?? null,
				actor: entry.actor,
				action: entry.action,
				detail: entry.detail,
				createdById: entry.createdById ?? null,
			},
		});
	}
}

function statusFrom(
	current: MarketingContentStatus,
	allowed: MarketingContentStatus[],
): boolean {
	return allowed.includes(current);
}

function assertStatus(
	current: MarketingContentStatus,
	allowed: MarketingContentStatus[],
): void {
	if (!allowed.includes(current)) {
		throw new BadRequestException(
			`Content is ${current}; expected one of ${allowed.join(", ")}.`,
		);
	}
}

function parsePlatforms(value: Prisma.JsonValue): string[] {
	const parsed = z.array(z.string()).safeParse(value);
	return parsed.success ? parsed.data : [];
}

function mediaKindOf(mimeType: string): DriveMediaKind {
	if (mimeType.startsWith("image/")) return DriveMediaKind.IMAGE;
	if (mimeType.startsWith("video/")) return DriveMediaKind.VIDEO;
	return DriveMediaKind.OTHER;
}

const approvalMetadata = z.looseObject({
	note: z.string().nullable().optional(),
});

function readNote(value: Prisma.JsonValue | null): string | null {
	const parsed = approvalMetadata.safeParse(value);
	return parsed.success ? (parsed.data.note ?? null) : null;
}

function serializeAsset(asset: {
	id: string;
	driveFileId: string;
	fileName: string;
	mimeType: string;
	mediaKind: DriveMediaKind;
	service: string | null;
	folderName: string | null;
	approvalState: DriveAssetApprovalState;
	lastUsedAt: Date | null;
	timesUsed: number;
	doNotUseUntil: Date | null;
}) {
	return {
		id: asset.id,
		driveFileId: asset.driveFileId,
		fileName: asset.fileName,
		mimeType: asset.mimeType,
		mediaKind: asset.mediaKind,
		service: asset.service,
		folderName: asset.folderName,
		approvalState: asset.approvalState,
		lastUsedAt: asset.lastUsedAt?.toISOString() ?? null,
		timesUsed: asset.timesUsed,
		doNotUseUntil: asset.doNotUseUntil?.toISOString() ?? null,
	};
}

function serializeAttempt(
	attempt: {
		id: string;
		contentId: string | null;
		socialPostId: string | null;
		platform: string;
		success: boolean;
		externalPostId: string | null;
		externalPostUrl: string | null;
		errorCategory: PublishErrorCategory | null;
		errorSummary: string | null;
		publishedAt: Date | null;
		idempotencyKey: string;
	},
	replayed: boolean,
) {
	return {
		id: attempt.id,
		contentId: attempt.contentId,
		socialPostId: attempt.socialPostId,
		platform: attempt.platform,
		success: attempt.success,
		externalPostId: attempt.externalPostId,
		externalPostUrl: attempt.externalPostUrl,
		errorCategory: attempt.errorCategory,
		errorSummary: attempt.errorSummary,
		publishedAt: attempt.publishedAt?.toISOString() ?? null,
		idempotencyKey: attempt.idempotencyKey,
		replayed,
	};
}
