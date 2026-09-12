import {
	ApprovalRequestStatus,
	ApprovalRiskLevel,
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	MarketingIntegrationStatus,
	MarketingProvider,
	type Prisma,
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
	type ComposeEmailCampaignInput,
	type CreateEmailTemplateInput,
	EMAIL_SCHEDULE_APPROVAL_TYPE,
	type EmailCreateListInput,
	type EmailScheduleDecideInput,
	type EmailScheduleRequestInput,
	type EmailSubscribersInput,
	type EmailSyncListInput,
	type EmailTemplateBlock,
	type EmailTemplateOutput,
	emailScheduleMetadata,
	emailTemplateBlocks,
	type UpdateEmailTemplateInput,
} from "./email.contracts";
import { renderEmailTemplate } from "./email-template";
import { ListmonkClient, type ListmonkConfig } from "./listmonk.client";
import { MARKETING_EMAIL } from "./marketing-config";

const listmonkConfig = z.object({
	baseUrl: z.string().url(),
	authMethod: z.enum(["basic", "token"]),
	username: z.string().optional(),
});

const listmonkSecrets = z.object({
	password: z.string().optional(),
	token: z.string().optional(),
});

@Injectable()
export class MarketingEmailService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly listmonk: ListmonkClient,
	) {}

	async templates(source: BusinessContextSource) {
		const context = await resolveBusinessContext(this.db, source);
		const rows = await this.db.marketingEmailTemplate.findMany({
			where: { businessUnitId: context.businessUnitId },
			orderBy: { updatedAt: "desc" },
		});
		return { templates: rows.map(serializeTemplate) };
	}

	async createTemplate(
		source: BusinessContextSource,
		input: CreateEmailTemplateInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const row = await this.db.marketingEmailTemplate.create({
			data: {
				businessUnitId: context.businessUnitId,
				name: input.name,
				description: input.description ?? null,
				previewText: input.previewText ?? null,
				blocks: toJson(emailTemplateBlocks.parse(input.blocks)),
				status: "draft",
				createdById: source.userId,
			},
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.template_created",
			{
				templateId: row.id,
				name: row.name,
			},
		);
		return serializeTemplate(row);
	}

	async updateTemplate(
		source: BusinessContextSource,
		input: UpdateEmailTemplateInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingEmailTemplate.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!existing) throw new NotFoundException("Email template not found.");
		if (existing.status === "archived") {
			throw new BadRequestException("Archived templates cannot be edited.");
		}

		const row = await this.db.marketingEmailTemplate.update({
			where: { id: existing.id },
			data: {
				name: input.name,
				description: input.description,
				previewText: input.previewText,
				blocks:
					input.blocks !== undefined
						? toJson(emailTemplateBlocks.parse(input.blocks))
						: undefined,
				status: "ready",
			},
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.template_updated",
			{
				templateId: row.id,
			},
		);
		return serializeTemplate(row);
	}

	async archiveTemplate(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingEmailTemplate.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!existing) throw new NotFoundException("Email template not found.");

		const row = await this.db.marketingEmailTemplate.update({
			where: { id: existing.id },
			data: { status: "archived" },
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.template_archived",
			{ templateId: row.id },
		);
		return serializeTemplate(row);
	}

	async renderTemplate(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const row = await this.db.marketingEmailTemplate.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!row) throw new NotFoundException("Email template not found.");
		const blocks = emailTemplateBlocks.parse(row.blocks);
		return {
			html: renderEmailTemplate(blocks, { previewText: row.previewText }),
		};
	}

	async composeCampaign(
		source: BusinessContextSource,
		input: ComposeEmailCampaignInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const credentials = await this.credentials(context.businessUnitId);

		let body = input.body ?? null;
		if (input.templateId) {
			const template = await this.db.marketingEmailTemplate.findFirst({
				where: { id: input.templateId, businessUnitId: context.businessUnitId },
			});
			if (!template) throw new NotFoundException("Email template not found.");
			if (template.status === "archived") {
				throw new BadRequestException(
					"Archived templates cannot be used for campaigns.",
				);
			}
			body = renderEmailTemplate(emailTemplateBlocks.parse(template.blocks), {
				previewText: input.previewText ?? template.previewText,
			});
		}
		if (!body) {
			throw new BadRequestException("Provide a templateId or a raw body.");
		}

		const campaign = await this.listmonk.createCampaign(credentials, {
			name: input.name,
			subject: input.subject,
			body,
			listIds: input.listIds,
			fromEmail: input.fromEmail,
			tags: input.tags,
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.campaign_created",
			{
				campaignId: campaign.data.id,
				name: input.name,
				templateId: input.templateId ?? null,
				listIds: input.listIds,
			},
		);
		return {
			id: campaign.data.id,
			name: input.name,
			status: campaign.data.status ?? "draft",
		};
	}

	async requestSchedule(
		source: BusinessContextSource,
		input: EmailScheduleRequestInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const sendAt = new Date(input.sendAt);
		if (sendAt.getTime() <= Date.now()) {
			throw new BadRequestException("The schedule time must be in the future.");
		}

		const approval = await this.db.approvalRequest.create({
			data: {
				businessUnitId: context.businessUnitId,
				type: EMAIL_SCHEDULE_APPROVAL_TYPE,
				summary: `Schedule email campaign "${input.campaignName}" for ${sendAt.toISOString()}`,
				proposedAction: {
					provider: MarketingProvider.LISTMONK,
					action: "campaign.schedule",
					campaignId: input.campaignId,
					sendAt: sendAt.toISOString(),
				},
				riskLevel: ApprovalRiskLevel.HIGH,
				metadata: {
					requiresHumanApproval: true,
					campaignId: input.campaignId,
					campaignName: input.campaignName,
					sendAt: sendAt.toISOString(),
				},
			},
			select: { id: true, status: true },
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.schedule_requested",
			{
				approvalRequestId: approval.id,
				campaignId: input.campaignId,
				sendAt: sendAt.toISOString(),
			},
		);
		return {
			approvalRequestId: approval.id,
			status: approval.status,
			campaignId: input.campaignId,
			sendAt: sendAt.toISOString(),
		};
	}

	async decideSchedule(
		source: BusinessContextSource,
		input: EmailScheduleDecideInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const approval = await this.db.approvalRequest.findFirst({
			where: {
				id: input.approvalRequestId,
				businessUnitId: context.businessUnitId,
				type: EMAIL_SCHEDULE_APPROVAL_TYPE,
			},
		});
		if (!approval) throw new NotFoundException("Schedule approval not found.");
		if (approval.status !== ApprovalRequestStatus.PENDING) {
			throw new BadRequestException(
				"This schedule request has already been decided.",
			);
		}

		const metadata = emailScheduleMetadata.parse(approval.metadata ?? {});

		if (input.decision === "REJECT") {
			await this.db.approvalRequest.update({
				where: { id: approval.id },
				data: {
					status: ApprovalRequestStatus.REJECTED,
					rejectedAt: new Date(),
				},
			});
			await this.event(
				context.businessUnitId,
				"marketing.email.schedule_rejected",
				{ approvalRequestId: approval.id, campaignId: metadata.campaignId },
			);
			return {
				approvalRequestId: approval.id,
				status: ApprovalRequestStatus.REJECTED,
				campaignId: metadata.campaignId,
				sendAt: metadata.sendAt,
			};
		}

		const credentials = await this.credentials(context.businessUnitId);
		await this.listmonk.updateCampaign(credentials, {
			campaignId: metadata.campaignId,
			sendAt: metadata.sendAt,
		});
		const updated = await this.listmonk.updateCampaignStatus(credentials, {
			campaignId: metadata.campaignId,
			status: "scheduled",
		});

		await this.db.approvalRequest.update({
			where: { id: approval.id },
			data: {
				status: ApprovalRequestStatus.APPROVED,
				approvedById: source.userId,
				approvedAt: new Date(),
			},
		});
		await this.event(
			context.businessUnitId,
			"marketing.email.schedule_applied",
			{
				approvalRequestId: approval.id,
				campaignId: metadata.campaignId,
				sendAt: metadata.sendAt,
				listmonkStatus: updated.data.status,
			},
		);
		return {
			approvalRequestId: approval.id,
			status: ApprovalRequestStatus.APPROVED,
			campaignId: metadata.campaignId,
			sendAt: metadata.sendAt,
		};
	}

	async pendingSchedules(businessUnitId: string) {
		const rows = await this.db.approvalRequest.findMany({
			where: {
				businessUnitId,
				type: EMAIL_SCHEDULE_APPROVAL_TYPE,
				status: ApprovalRequestStatus.PENDING,
			},
			orderBy: { createdAt: "desc" },
			take: MARKETING_EMAIL.subscriberPageSize,
			select: { id: true, summary: true, metadata: true, createdAt: true },
		});
		return rows.flatMap((row) => {
			const parsed = emailScheduleMetadata.safeParse(row.metadata ?? {});
			if (!parsed.success) return [];
			return [
				{
					id: row.id,
					summary: row.summary,
					campaignId: parsed.data.campaignId,
					campaignName: parsed.data.campaignName ?? null,
					sendAt: parsed.data.sendAt,
					createdAt: row.createdAt.toISOString(),
				},
			];
		});
	}

	async createList(source: BusinessContextSource, input: EmailCreateListInput) {
		const context = await resolveBusinessContext(this.db, source);
		const credentials = await this.credentials(context.businessUnitId);
		const list = await this.listmonk.createList(credentials, {
			name: input.name,
			description: input.description,
		});
		await this.event(context.businessUnitId, "marketing.email.list_created", {
			listId: list.data.id,
			name: input.name,
		});
		return {
			id: list.data.id,
			name: list.data.name,
			status: list.data.status,
			subscriberCount: list.data.subscriber_count ?? null,
		};
	}

	async syncList(source: BusinessContextSource, input: EmailSyncListInput) {
		const context = await resolveBusinessContext(this.db, source);
		const credentials = await this.credentials(context.businessUnitId);

		const contacts = await this.db.contact.findMany({
			where: {
				email: { not: null },
				emailMarketingAllowed: true,
				unsubscribeDate: null,
				archivedAt: null,
			},
			select: {
				email: true,
				firstName: true,
				lastName: true,
			},
			take: MARKETING_EMAIL.syncContactLimit,
		});

		const existing = await this.listmonk.subscribers(credentials, {
			listId: input.listId,
			page: 1,
			perPage: "all",
		});
		const present = new Set(
			existing.subscribers.map((row) => row.email.toLowerCase()),
		);

		let synced = 0;
		let existingCount = 0;
		let failed = 0;
		for (const contact of contacts) {
			if (!contact.email) continue;
			const email = contact.email.toLowerCase();
			if (present.has(email)) {
				existingCount += 1;
				continue;
			}
			try {
				await this.listmonk.createSubscriber(credentials, {
					email: contact.email,
					name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
					listIds: [input.listId],
				});
				present.add(email);
				synced += 1;
			} catch {
				failed += 1;
			}
		}

		const consentBlocked = await this.db.contact.count({
			where: {
				email: { not: null },
				archivedAt: null,
				OR: [
					{ emailMarketingAllowed: false },
					{ unsubscribeDate: { not: null } },
				],
			},
		});

		await this.event(context.businessUnitId, "marketing.email.list_synced", {
			listId: input.listId,
			synced,
			existing: existingCount,
			failed,
			consentBlocked,
		});
		return {
			listId: input.listId,
			synced,
			existing: existingCount,
			failed,
			consentBlocked,
		};
	}

	async subscribers(
		source: BusinessContextSource,
		input: EmailSubscribersInput,
	) {
		const context = await resolveBusinessContext(this.db, source);
		const credentials = await this.credentials(context.businessUnitId);
		const result = await this.listmonk.subscribers(credentials, {
			listId: input.listId,
			page: input.page,
			perPage: MARKETING_EMAIL.subscriberPageSize,
		});
		return {
			total: result.total,
			page: input.page,
			subscribers: result.subscribers.map((row) => ({
				id: row.id,
				email: row.email,
				name: row.name ?? "",
				status: row.status,
				subscriptionStatus: input.listId
					? (row.lists.find((list) => list.id === input.listId)
							?.subscription_status ?? null)
					: null,
			})),
		};
	}

	private async credentials(businessUnitId: string): Promise<ListmonkConfig> {
		const integration = await this.db.marketingIntegration.findUnique({
			where: {
				businessUnitId_provider: {
					businessUnitId,
					provider: MarketingProvider.LISTMONK,
				},
			},
			select: { status: true, config: true, secrets: true },
		});
		if (
			!integration ||
			integration.status === MarketingIntegrationStatus.NOT_CONFIGURED
		) {
			throw new BadRequestException("Listmonk is not connected.");
		}
		return {
			...listmonkConfig.parse(integration.config ?? {}),
			...listmonkSecrets.parse(integration.secrets ?? {}),
		};
	}

	private async event(
		businessUnitId: string,
		type: string,
		data: Prisma.InputJsonObject,
	) {
		await this.db.businessEvent.create({
			data: {
				businessUnitId,
				type,
				source: BusinessEventSource.SYSTEM,
				channel: CommunicationChannel.INTERNAL,
				occurredAt: new Date(),
				data,
				idempotencyKey: `marketing:email:${type}:${crypto.randomUUID()}`,
			},
		});
	}
}

function serializeTemplate(row: {
	id: string;
	name: string;
	description: string | null;
	previewText: string | null;
	blocks: Prisma.JsonValue;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}): EmailTemplateOutput {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		previewText: row.previewText,
		blocks: emailTemplateBlocks.parse(row.blocks),
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toJson(value: EmailTemplateBlock[]): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
