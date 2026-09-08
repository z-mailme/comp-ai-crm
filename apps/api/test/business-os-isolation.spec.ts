import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AgentActionStatus,
	AgentRunStatus,
	AgentTriggerType,
	ApprovalRequestStatus,
	AutomationExecutionStatus,
	AutomationRuleStatus,
	BusinessEventOutboxStatus,
	BusinessEventSource,
	BusinessTaskPriority,
	BusinessTaskStatus,
	BusinessUnitStatus,
	CommunicationChannel,
	CommunicationDirection,
	CommunicationParticipantRole,
	ConversationPriority,
	ConversationStatus,
	CustomerIdentityKind,
	CustomerIdentityStatus,
	db,
	KnowledgeItemType,
	KnowledgeVersionStatus,
	MemoryEntityType,
	MemoryProvider,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { BusinessOsService } from "../src/business-os/business-os.service";
import { ConversionService } from "../src/currency/conversion.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `business-os-isolation-${suffix}`;
const ownerUserId = `owner-${marker}`;
const memberUserId = `member-${marker}`;
const strangerUserId = `stranger-${marker}`;
const singleUserId = `single-${marker}`;
const singleUnitId = `single-unit-${marker}`;
const singleForeignUnitId = `single-foreign-unit-${marker}`;
const singleForeignConversationId = `single-foreign-conversation-${marker}`;
const service = new BusinessOsService(db, new ConversionService(db));

const eventProps = fixture("event-props", "Event Props", ownerUserId);
const cascade = fixture("cascade-cleaning", "Cascade Cleaning", ownerUserId);

beforeAll(async () => {
	await clean();
});

afterAll(async () => {
	await clean();
});

describe("Business OS BusinessUnit isolation", () => {
	it("keeps single-BusinessUnit compatibility without exposing all rows", async () => {
		await clean();
		const pausedUnitIds = await pauseOtherActiveBusinessUnits();

		try {
			await seedSingleBusiness();

			const overview = await service.overview({ userId: singleUserId });
			const inbox = await service.inbox(
				{ userId: singleUserId },
				{ channel: CommunicationChannel.EMAIL, limit: 100 },
			);

			const inboxIds = inbox.conversations.map((row) => row.id);

			expect(overview.counts.openConversations).toBeGreaterThan(0);
			expect(inboxIds).toContain(`single-conversation-${marker}`);
			expect(inboxIds).not.toContain(singleForeignConversationId);
		} finally {
			await clean();
			await restoreBusinessUnits(pausedUnitIds);
			await seedMultiBusiness();
		}
	});

	it("requires explicit context when the user can access multiple units", async () => {
		await expect(service.overview({ userId: ownerUserId })).rejects.toThrow(
			"Choose a business unit.",
		);
	});

	it("rejects invalid, foreign and unauthorized BusinessUnit requests", async () => {
		await expect(
			service.overview({
				userId: ownerUserId,
				businessUnitId: `missing-${marker}`,
			}),
		).rejects.toThrow("Business unit not found.");
		await expect(
			service.overview({
				userId: memberUserId,
				businessUnitId: cascade.unitId,
			}),
		).rejects.toThrow("You cannot access this business unit.");
		await expect(
			service.overview({
				userId: strangerUserId,
				businessUnitId: eventProps.unitId,
			}),
		).rejects.toThrow("You are not a member of this workspace.");
	});

	it("keeps Event Props overview reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const overview = await service.overview(context);

		expect(overview.counts.openConversations).toBe(1);
		expect(overview.counts.pendingApprovals).toBe(1);
		expect(overview.counts.openTasks).toBe(1);
		expect(overview.counts.queuedOutbox).toBe(1);
		expect(overview.counts.activeAutomations).toBe(1);
	});

	it("keeps Event Props inbox reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const inbox = await service.inbox(context, {
			channel: CommunicationChannel.EMAIL,
			limit: 20,
		});

		expect(inbox.conversations.map((row) => row.id)).toEqual([
			eventProps.conversationId,
		]);
	});

	it("keeps Event Props conversation detail reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const conversation = await service.conversation(
			context,
			eventProps.conversationId,
		);

		expect(conversation.messages.map((row) => row.id)).toEqual([
			eventProps.messageId,
		]);
	});

	it("rejects cross-unit Event Props conversation detail reads", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };

		await expect(
			service.conversation(context, cascade.conversationId),
		).rejects.toThrow("Conversation not found.");
	});

	it("keeps Event Props customer reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const customer = await service.customer360(context, eventProps.contactId);

		expect(customer.deals.map((row) => row.id)).toEqual([eventProps.dealId]);
		expect(customer.tasks.map((row) => row.id)).toEqual([eventProps.taskId]);
		expect(customer.events.map((row) => row.id)).toEqual([eventProps.eventId]);
	});

	it("rejects cross-unit Event Props customer reads", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };

		await expect(
			service.customer360(context, cascade.contactId),
		).rejects.toThrow("Contact not found.");
	});

	it("keeps Event Props approval and knowledge reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const approvals = await service.approvals(context);
		const knowledge = await service.knowledge(context);

		expect(approvals.approvals.map((row) => row.id)).toEqual([
			eventProps.approvalId,
		]);
		expect(knowledge.items.map((row) => row.id)).toEqual([
			eventProps.knowledgeId,
		]);
	});

	it("keeps Event Props observability and search reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: eventProps.unitId };
		const observability = await service.observability(context);
		const search = await service.globalSearch(context, {
			q: eventProps.label,
			limit: 25,
		});
		const cascadeSearch = await service.globalSearch(context, {
			q: cascade.label,
			limit: 25,
		});

		expect(observability.automationRules.active).toBe(1);
		expect(observability.automationExecutions.queued).toBe(1);
		expect(observability.outbox.pending).toBe(1);
		expect(search.hits.map((hit) => hit.id)).not.toContain(cascade.companyId);
		expect(search.hits.map((hit) => hit.id)).toContain(eventProps.companyId);
		expect(JSON.stringify(search)).not.toContain(cascade.label);
		expect(cascadeSearch.hits).toEqual([]);
	});

	it("keeps Cascade Cleaning overview and inbox reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: cascade.unitId };
		const overview = await service.overview(context);
		const inbox = await service.inbox(context, {
			channel: CommunicationChannel.EMAIL,
			limit: 20,
		});

		expect(overview.counts.openConversations).toBe(1);
		expect(inbox.conversations.map((row) => row.id)).toEqual([
			cascade.conversationId,
		]);
	});

	it("keeps Cascade Cleaning search reads isolated", async () => {
		const context = { userId: ownerUserId, businessUnitId: cascade.unitId };
		const search = await service.globalSearch(context, {
			q: eventProps.label,
			limit: 25,
		});

		expect(search.hits).toEqual([]);
	});

	it("rejects cross-unit Cascade Cleaning conversation detail reads", async () => {
		const context = { userId: ownerUserId, businessUnitId: cascade.unitId };

		await expect(
			service.conversation(context, eventProps.conversationId),
		).rejects.toThrow("Conversation not found.");
	});

	it("keeps ChannelAccount and mailbox event projection in the selected unit", async () => {
		expect(
			await db.conversation.findUniqueOrThrow({
				where: { id: eventProps.conversationId },
				select: { businessUnitId: true, channelAccountId: true },
			}),
		).toEqual({
			businessUnitId: eventProps.unitId,
			channelAccountId: eventProps.channelId,
		});
		expect(
			await db.businessEvent.findUniqueOrThrow({
				where: { id: eventProps.eventId },
				select: { businessUnitId: true },
			}),
		).toEqual({ businessUnitId: eventProps.unitId });
		expect(
			await db.businessEventOutbox.findFirstOrThrow({
				where: { businessEventId: eventProps.eventId },
				select: { businessEvent: { select: { businessUnitId: true } } },
			}),
		).toEqual({ businessEvent: { businessUnitId: eventProps.unitId } });
		expect(
			await db.externalMemoryLink.findFirstOrThrow({
				where: { businessEventId: eventProps.eventId },
				select: { businessUnitId: true },
			}),
		).toEqual({ businessUnitId: eventProps.unitId });
	});
});

function fixture(slug: string, label: string, ownerId: string) {
	const id = `${slug}-${marker}`;

	return {
		label,
		unitId: `unit-${id}`,
		channelId: `channel-${id}`,
		companyId: `company-${id}`,
		contactId: `contact-${id}`,
		dealId: `deal-${id}`,
		bookingId: `booking-${id}`,
		conversationId: `conversation-${id}`,
		messageId: `message-${id}`,
		eventId: `event-${id}`,
		approvalId: `approval-${id}`,
		knowledgeId: `knowledge-${id}`,
		automationId: `automation-${id}`,
		taskId: `task-${id}`,
		agentId: `agent-${id}`,
		versionId: `version-${id}`,
		runId: `run-${id}`,
		actionId: `action-${id}`,
		decisionId: `decision-${id}`,
		ownerId,
		mailbox: `${slug}-${marker}@example.test`,
		customerEmail: `buyer-${slug}-${marker}@example.test`,
	};
}

async function seedSingleBusiness(): Promise<void> {
	await seedWorkspace();
	await db.user.create({
		data: {
			id: singleUserId,
			name: "Single Unit User",
			email: `${singleUserId}@example.test`,
		},
	});
	await db.member.create({
		data: {
			id: `single-member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId: singleUserId,
			role: "member",
			createdAt: new Date(),
		},
	});
	await db.businessUnit.create({
		data: {
			id: singleUnitId,
			name: `Single Unit ${marker}`,
			slug: `single-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: singleUserId,
		},
	});
	await db.businessUnit.create({
		data: {
			id: singleForeignUnitId,
			name: `Single Foreign Unit ${marker}`,
			slug: singleForeignUnitId,
			status: BusinessUnitStatus.PAUSED,
			ownerId: singleUserId,
		},
	});
	await db.conversation.create({
		data: {
			id: `single-conversation-${marker}`,
			channel: CommunicationChannel.EMAIL,
			status: ConversationStatus.OPEN,
			subject: `Single ${marker}`,
			preview: `Single ${marker}`,
			externalThreadId: `single-thread-${marker}`,
			firstMessageAt: new Date("2026-09-05T08:00:00.000Z"),
			lastMessageAt: new Date("2026-09-05T08:00:00.000Z"),
		},
	});
	await db.conversation.create({
		data: {
			id: singleForeignConversationId,
			businessUnitId: singleForeignUnitId,
			channel: CommunicationChannel.EMAIL,
			status: ConversationStatus.OPEN,
			subject: `Single Foreign ${marker}`,
			preview: `Single Foreign ${marker}`,
			externalThreadId: `single-foreign-thread-${marker}`,
			firstMessageAt: new Date("2026-09-05T08:00:00.000Z"),
			lastMessageAt: new Date("2026-09-05T08:00:00.000Z"),
		},
	});
}

async function seedMultiBusiness(): Promise<void> {
	await seedWorkspace();
	await db.user.createMany({
		data: [
			{
				id: ownerUserId,
				name: "Business Owner",
				email: `${ownerUserId}@example.test`,
			},
			{
				id: memberUserId,
				name: "Event Props Operator",
				email: `${memberUserId}@example.test`,
			},
			{
				id: strangerUserId,
				name: "Stranger",
				email: `${strangerUserId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `owner-member-${marker}`,
				organizationId: WORKSPACE_ID,
				userId: ownerUserId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `member-member-${marker}`,
				organizationId: WORKSPACE_ID,
				userId: memberUserId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await seedBusiness({ ...eventProps, ownerId: memberUserId });
	await seedBusiness(cascade);
}

async function seedWorkspace(): Promise<void> {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
}

async function pauseOtherActiveBusinessUnits(): Promise<string[]> {
	const units = await db.businessUnit.findMany({
		where: {
			status: BusinessUnitStatus.ACTIVE,
			slug: { not: { contains: marker } },
		},
		select: { id: true },
	});
	const ids = units.map((unit) => unit.id);

	if (ids.length > 0) {
		await db.businessUnit.updateMany({
			where: { id: { in: ids } },
			data: { status: BusinessUnitStatus.PAUSED },
		});
	}

	return ids;
}

async function restoreBusinessUnits(ids: string[]): Promise<void> {
	if (ids.length === 0) return;

	await db.businessUnit.updateMany({
		where: { id: { in: ids } },
		data: { status: BusinessUnitStatus.ACTIVE },
	});
}

async function seedBusiness(input: ReturnType<typeof fixture>): Promise<void> {
	await db.businessUnit.create({
		data: {
			id: input.unitId,
			name: `${input.label} ${marker}`,
			slug: input.unitId,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: input.ownerId,
		},
	});
	await db.channelAccount.create({
		data: {
			id: input.channelId,
			businessUnitId: input.unitId,
			userId: ownerUserId,
			channel: CommunicationChannel.EMAIL,
			provider: "gmail",
			externalAccountId: input.mailbox,
			label: `${input.label} Gmail ${marker}`,
		},
	});
	await db.company.create({
		data: {
			id: input.companyId,
			name: `${input.label} Company ${marker}`,
			domain: `${input.unitId}.example.test`,
			ownerId: ownerUserId,
		},
	});
	await db.contact.create({
		data: {
			id: input.contactId,
			firstName: input.label,
			lastName: "Buyer",
			email: input.customerEmail,
			companyId: input.companyId,
			ownerId: ownerUserId,
		},
	});
	await db.deal.create({
		data: {
			id: input.dealId,
			name: `${input.label} Deal ${marker}`,
			companyId: input.companyId,
			ownerId: ownerUserId,
			contacts: { create: { contactId: input.contactId } },
		},
	});
	await db.booking.create({
		data: {
			id: input.bookingId,
			dealId: input.dealId,
			bookingKey: `${input.label} Booking ${marker}`,
			eventDate: new Date("2026-10-10T00:00:00.000Z"),
		},
	});
	await db.customerIdentity.create({
		data: {
			businessUnitId: input.unitId,
			contactId: input.contactId,
			companyId: input.companyId,
			kind: CustomerIdentityKind.EMAIL,
			channel: CommunicationChannel.EMAIL,
			value: input.customerEmail,
			status: CustomerIdentityStatus.VERIFIED,
		},
	});
	await db.agentDefinition.create({
		data: {
			id: input.agentId,
			name: `${input.label} Agent ${marker}`,
			createdById: ownerUserId,
		},
	});
	await db.agentVersion.create({
		data: {
			id: input.versionId,
			agentId: input.agentId,
			number: 1,
			status: "READY",
			instructions: `Serve ${input.label}.`,
			manifest: {},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: ownerUserId,
		},
	});
	await db.conversation.create({
		data: {
			id: input.conversationId,
			businessUnitId: input.unitId,
			channelAccountId: input.channelId,
			channel: CommunicationChannel.EMAIL,
			status: ConversationStatus.OPEN,
			priority: ConversationPriority.NORMAL,
			subject: `${input.label} Conversation ${marker}`,
			preview: `${input.label} Preview ${marker}`,
			externalThreadId: `thread-${input.unitId}`,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			bookingId: input.bookingId,
			firstMessageAt: new Date("2026-09-05T08:00:00.000Z"),
			lastMessageAt: new Date("2026-09-05T08:10:00.000Z"),
			unreadCount: 1,
		},
	});
	await db.communicationMessage.create({
		data: {
			id: input.messageId,
			conversationId: input.conversationId,
			channel: CommunicationChannel.EMAIL,
			direction: CommunicationDirection.INBOUND,
			sender: { email: input.customerEmail },
			recipients: [{ email: input.mailbox }],
			subject: `${input.label} Message ${marker}`,
			body: `${input.label} Body ${marker}`,
			snippet: `${input.label} Snippet ${marker}`,
			sentAt: new Date("2026-09-05T08:10:00.000Z"),
			providerMessageId: `provider-${input.unitId}`,
		},
	});
	await db.communicationParticipant.create({
		data: {
			conversationId: input.conversationId,
			messageId: input.messageId,
			contactId: input.contactId,
			companyId: input.companyId,
			role: CommunicationParticipantRole.SENDER,
			name: `${input.label} Buyer`,
			email: input.customerEmail,
		},
	});
	await db.conversationInsight.create({
		data: {
			conversationId: input.conversationId,
			messageId: input.messageId,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			bookingId: input.bookingId,
			intent: `${input.label} intent`,
			summary: `${input.label} Insight ${marker}`,
			needsHumanReview: true,
		},
	});
	await db.businessEvent.create({
		data: {
			id: input.eventId,
			businessUnitId: input.unitId,
			type: `${input.label}.communication.received.${marker}`,
			source: BusinessEventSource.GMAIL,
			channel: CommunicationChannel.EMAIL,
			actorType: "contact",
			actorId: input.contactId,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			bookingId: input.bookingId,
			conversationId: input.conversationId,
			messageId: input.messageId,
			occurredAt: new Date("2026-09-05T08:10:00.000Z"),
			data: { label: input.label },
			correlationId: input.unitId,
			idempotencyKey: `event-${input.unitId}`,
			outbox: {
				create: {
					destination: "memory-bridge",
					status: BusinessEventOutboxStatus.PENDING,
					payload: {
						businessUnitId: input.unitId,
						businessEventId: input.eventId,
					},
				},
			},
		},
	});
	await db.agentRun.create({
		data: {
			id: input.runId,
			agentId: input.agentId,
			versionId: input.versionId,
			initiatedById: ownerUserId,
			triggerType: AgentTriggerType.EVENT,
			status: AgentRunStatus.QUEUED,
			idempotencyKey: `run-${input.unitId}`,
			correlationId: `run-${input.unitId}`,
			input: { businessEventId: input.eventId },
			businessEventId: input.eventId,
		},
	});
	await db.approvalRequest.create({
		data: {
			id: input.approvalId,
			businessUnitId: input.unitId,
			requestedByAgentId: input.agentId,
			runId: input.runId,
			businessEventId: input.eventId,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			bookingId: input.bookingId,
			conversationId: input.conversationId,
			messageId: input.messageId,
			type: "email.send",
			summary: `${input.label} Approval ${marker}`,
			proposedAction: { type: "email.send", to: input.customerEmail },
			status: ApprovalRequestStatus.PENDING,
		},
	});
	await db.agentAction.create({
		data: {
			id: input.actionId,
			agentId: input.agentId,
			runId: input.runId,
			type: "email.send",
			provider: "gmail",
			summary: `${input.label} Action ${marker}`,
			status: AgentActionStatus.PLANNED,
			idempotencyKey: `action-${input.unitId}`,
			approvalRequired: true,
			approvalRequestId: input.approvalId,
		},
	});
	await db.knowledgeItem.create({
		data: {
			id: input.knowledgeId,
			businessUnitId: input.unitId,
			type: KnowledgeItemType.PRICING,
			title: `${input.label} Knowledge ${marker}`,
			active: true,
			versions: {
				create: {
					version: 1,
					status: KnowledgeVersionStatus.ACTIVE,
					content: `${input.label} content`,
					createdById: ownerUserId,
				},
			},
			rules: {
				create: {
					businessUnitId: input.unitId,
					type: KnowledgeItemType.PRICING,
					title: `${input.label} Rule ${marker}`,
					condition: { label: input.label },
					action: { label: input.label },
					active: true,
					createdById: ownerUserId,
				},
			},
		},
	});
	await db.externalMemoryLink.create({
		data: {
			businessUnitId: input.unitId,
			businessEventId: input.eventId,
			provider: MemoryProvider.MEMO,
			externalMemoryId: `memory-${input.unitId}`,
			entityType: MemoryEntityType.BUSINESS_EVENT,
			entityId: input.eventId,
		},
	});
	await db.businessTask.create({
		data: {
			id: input.taskId,
			businessUnitId: input.unitId,
			ownerId: ownerUserId,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			bookingId: input.bookingId,
			conversationId: input.conversationId,
			sourceEventId: input.eventId,
			agentRunId: input.runId,
			title: `${input.label} Task ${marker}`,
			status: BusinessTaskStatus.TODO,
			priority: BusinessTaskPriority.NORMAL,
		},
	});
	await db.automationRule.create({
		data: {
			id: input.automationId,
			businessUnitId: input.unitId,
			name: `${input.label} Automation ${marker}`,
			status: AutomationRuleStatus.ACTIVE,
			triggerType: "businessEvent",
			conditions: { label: input.label },
			actions: { next: "approval" },
			createdById: ownerUserId,
			executions: {
				create: {
					businessEventId: input.eventId,
					status: AutomationExecutionStatus.QUEUED,
					input: { label: input.label },
				},
			},
		},
	});
	await db.activity.create({
		data: {
			type: "EMAIL",
			subject: `${input.label} Activity ${marker}`,
			body: `${input.label} Activity ${marker}`,
			contactId: input.contactId,
			companyId: input.companyId,
			dealId: input.dealId,
			createdById: ownerUserId,
		},
	});
}

async function clean(): Promise<void> {
	await db.automationExecution.deleteMany({
		where: { rule: { name: { contains: marker } } },
	});
	await db.automationRule.deleteMany({
		where: { name: { contains: marker } },
	});
	await db.businessTask.deleteMany({
		where: { title: { contains: marker } },
	});
	await db.externalMemoryLink.deleteMany({
		where: { externalMemoryId: { contains: marker } },
	});
	await db.businessRule.deleteMany({
		where: { title: { contains: marker } },
	});
	await db.knowledgeVersion.deleteMany({
		where: { knowledgeItem: { title: { contains: marker } } },
	});
	await db.knowledgeItem.deleteMany({
		where: { title: { contains: marker } },
	});
	await db.agentAction.deleteMany({
		where: { idempotencyKey: { contains: marker } },
	});
	await db.approvalRequest.deleteMany({
		where: { summary: { contains: marker } },
	});
	await db.agentDecision.deleteMany({
		where: { summary: { contains: marker } },
	});
	await db.agentRun.deleteMany({
		where: { idempotencyKey: { contains: marker } },
	});
	await db.agentVersion.deleteMany({
		where: { agent: { name: { contains: marker } } },
	});
	await db.agentDefinition.deleteMany({
		where: { name: { contains: marker } },
	});
	await db.businessEventOutbox.deleteMany({
		where: { businessEvent: { correlationId: { contains: marker } } },
	});
	await db.businessEvent.deleteMany({
		where: { correlationId: { contains: marker } },
	});
	await db.conversationInsight.deleteMany({
		where: { summary: { contains: marker } },
	});
	await db.communicationParticipant.deleteMany({
		where: { conversation: { externalThreadId: { contains: marker } } },
	});
	await db.communicationMessage.deleteMany({
		where: { conversation: { externalThreadId: { contains: marker } } },
	});
	await db.conversation.deleteMany({
		where: { externalThreadId: { contains: marker } },
	});
	await db.activity.deleteMany({
		where: { subject: { contains: marker } },
	});
	await db.customerIdentity.deleteMany({
		where: { value: { contains: marker } },
	});
	await db.booking.deleteMany({
		where: { bookingKey: { contains: marker } },
	});
	await db.dealContact.deleteMany({
		where: { deal: { name: { contains: marker } } },
	});
	await db.deal.deleteMany({
		where: { name: { contains: marker } },
	});
	await db.contact.deleteMany({
		where: { email: { contains: marker } },
	});
	await db.company.deleteMany({
		where: { name: { contains: marker } },
	});
	await db.channelAccount.deleteMany({
		where: { label: { contains: marker } },
	});
	await db.businessUnit.deleteMany({
		where: { slug: { contains: marker } },
	});
	await db.member.deleteMany({
		where: {
			userId: { in: [ownerUserId, memberUserId, strangerUserId, singleUserId] },
		},
	});
	await db.user.deleteMany({
		where: {
			id: { in: [ownerUserId, memberUserId, strangerUserId, singleUserId] },
		},
	});
}
