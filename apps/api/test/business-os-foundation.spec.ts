import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AgentActionStatus,
	AgentDefinitionStatus,
	AgentPermissionScope,
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

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `business-os-${suffix}`;
const userId = `user-${marker}`;
const companyId = `company-${marker}`;
const contactId = `contact-${marker}`;
const dealId = `deal-${marker}`;
const bookingId = `booking-${marker}`;
const unitAId = `unit-a-${marker}`;
const unitBId = `unit-b-${marker}`;
const channelAId = `channel-a-${marker}`;
const channelBId = `channel-b-${marker}`;
const conversationId = `conversation-${marker}`;
const messageId = `message-${marker}`;
const eventId = `event-${marker}`;
const approvalId = `approval-${marker}`;
const knowledgeId = `knowledge-${marker}`;
const automationId = `automation-${marker}`;
const agentId = `agent-${marker}`;
const versionId = `version-${marker}`;
const runId = `run-${marker}`;
const actionId = `action-${marker}`;
const decisionId = `decision-${marker}`;
const service = new BusinessOsService(db);
const contextA = { userId, businessUnitId: unitAId };

beforeAll(async () => {
	await clean();
	await seed();
});

afterAll(async () => {
	await clean();
});

describe("Business OS foundation", () => {
	it("reads conversations, events, approvals, knowledge, automation, inbox, search and Customer 360", async () => {
		const overview = await service.overview(contextA);
		const inbox = await service.inbox(
			{
				userId,
				businessUnitId: unitAId,
			},
			{
				channel: CommunicationChannel.EMAIL,
				status: ConversationStatus.OPEN,
				limit: 20,
			},
		);
		const conversation = await service.conversation(contextA, conversationId);
		const customer = await service.customer360(contextA, contactId);
		const approvals = await service.approvals(contextA);
		const knowledge = await service.knowledge(contextA);
		const observability = await service.observability(contextA);
		const search = await service.globalSearch(contextA, {
			q: marker,
			limit: 25,
		});

		expect(overview.killSwitch).toBe(false);
		expect(overview.counts.openConversations).toBeGreaterThanOrEqual(1);
		expect(overview.counts.pendingApprovals).toBeGreaterThanOrEqual(1);
		expect(overview.counts.queuedOutbox).toBeGreaterThanOrEqual(1);
		expect(inbox.conversations.some((row) => row.id === conversationId)).toBe(
			true,
		);
		expect(conversation.messages.map((row) => row.id)).toContain(messageId);
		expect(conversation.participants.map((row) => row.email)).toContain(
			`buyer-${marker}@example.test`,
		);
		expect(conversation.approvals.map((row) => row.id)).toContain(approvalId);
		expect(conversation.events.map((row) => row.id)).toContain(eventId);
		expect(customer.identities.map((row) => row.value)).toContain(
			`buyer-${marker}@example.test`,
		);
		expect(customer.conversations.map((row) => row.id)).toContain(
			conversationId,
		);
		expect(customer.deals.map((row) => row.id)).toContain(dealId);
		expect(
			customer.readiness.find((row) => row.key === "knowledge")?.ready,
		).toBe(true);
		expect(approvals.approvals.map((row) => row.id)).toContain(approvalId);
		expect(knowledge.items.find((row) => row.id === knowledgeId)).toMatchObject(
			{
				activeVersion: 2,
				versions: 2,
			},
		);
		expect(observability.outbox.pending).toBeGreaterThanOrEqual(1);
		expect(observability.automationExecutions.queued).toBeGreaterThanOrEqual(1);
		expect(observability.automationRules.active).toBeGreaterThanOrEqual(1);
		expect(new Set(search.hits.map((hit) => hit.kind))).toEqual(
			new Set([
				"company",
				"contact",
				"deal",
				"booking",
				"conversation",
				"message",
				"activity",
				"knowledge",
				"event",
			]),
		);
	});

	it("persists safe agent defaults, permission denials, pending approvals and concise audit evidence", async () => {
		const [agent, permission, safety, approval, action, decision] =
			await Promise.all([
				db.agentDefinition.findUniqueOrThrow({ where: { id: agentId } }),
				db.agentPermission.findUniqueOrThrow({
					where: {
						agentId_scope_target: {
							agentId,
							scope: AgentPermissionScope.SEND,
							target: "email",
						},
					},
				}),
				db.agentSafetyPolicy.findUniqueOrThrow({
					where: {
						businessUnitId_agentId: {
							businessUnitId: unitAId,
							agentId,
						},
					},
				}),
				db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
				db.agentAction.findUniqueOrThrow({ where: { id: actionId } }),
				db.agentDecision.findUniqueOrThrow({ where: { id: decisionId } }),
			]);

		expect(agent.status).toBe(AgentDefinitionStatus.DRAFT);
		expect(permission.allowed).toBe(false);
		expect(safety.enabled).toBe(false);
		expect(safety.automaticSending).toBe(false);
		expect(safety.killSwitch).toBe(false);
		expect(approval.status).toBe(ApprovalRequestStatus.PENDING);
		expect(action.status).toBe(AgentActionStatus.PLANNED);
		expect(action.approvalRequired).toBe(true);
		expect(action.summary.length).toBeLessThanOrEqual(160);
		expect(decision.status).toBe("PROPOSED");
		expect(JSON.stringify(action)).not.toContain("hidden-chain");
		expect(JSON.stringify(decision)).not.toContain("hidden-chain");
	});

	it("keeps BusinessUnit identities separate and links each channel account to its unit", async () => {
		const identities = await db.customerIdentity.findMany({
			where: { value: `shared-${marker}@example.test` },
			orderBy: { businessUnitId: "asc" },
			select: { businessUnitId: true, value: true },
		});
		const channels = await db.channelAccount.findMany({
			where: { id: { in: [channelAId, channelBId] } },
			orderBy: { id: "asc" },
			select: { id: true, businessUnitId: true },
		});

		expect(identities).toEqual([
			{ businessUnitId: unitAId, value: `shared-${marker}@example.test` },
			{ businessUnitId: unitBId, value: `shared-${marker}@example.test` },
		]);
		expect(channels).toEqual([
			{ id: channelAId, businessUnitId: unitAId },
			{ id: channelBId, businessUnitId: unitBId },
		]);
	});
});

async function seed(): Promise<void> {
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
	await db.user.create({
		data: {
			id: userId,
			name: "Business OS Stabilizer",
			email: `${userId}@example.test`,
		},
	});
	await db.member.create({
		data: {
			id: `member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
	});
	await db.appSetting.create({
		data: { id: `settings-${marker}` },
	});
	await db.businessUnit.createMany({
		data: [
			{
				id: unitAId,
				name: `Business Unit A ${marker}`,
				slug: `business-unit-a-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
			{
				id: unitBId,
				name: `Business Unit B ${marker}`,
				slug: `business-unit-b-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
		],
	});
	await db.channelAccount.createMany({
		data: [
			{
				id: channelAId,
				businessUnitId: unitAId,
				userId,
				channel: CommunicationChannel.EMAIL,
				provider: `gmail-a-${marker}`,
				externalAccountId: `mail-a-${marker}`,
				label: `Sales Gmail ${marker}`,
			},
			{
				id: channelBId,
				businessUnitId: unitBId,
				userId,
				channel: CommunicationChannel.EMAIL,
				provider: `gmail-b-${marker}`,
				externalAccountId: `mail-b-${marker}`,
				label: `Support Gmail ${marker}`,
			},
		],
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Company ${marker}`,
			domain: `${marker}.example.test`,
			ownerId: userId,
		},
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: `Buyer ${marker}`,
			email: `buyer-${marker}@example.test`,
			companyId,
			ownerId: userId,
		},
	});
	await db.deal.create({
		data: {
			id: dealId,
			name: `Deal ${marker}`,
			companyId,
			ownerId: userId,
			contacts: { create: { contactId, role: "Decision maker" } },
		},
	});
	await db.booking.create({
		data: {
			id: bookingId,
			dealId,
			bookingKey: `booking-${marker}`,
			eventDate: new Date("2026-10-10T00:00:00.000Z"),
		},
	});
	await db.customerIdentity.createMany({
		data: [
			{
				businessUnitId: unitAId,
				contactId,
				companyId,
				kind: CustomerIdentityKind.EMAIL,
				channel: CommunicationChannel.EMAIL,
				value: `buyer-${marker}@example.test`,
				status: CustomerIdentityStatus.VERIFIED,
				confidence: 0.99,
			},
			{
				businessUnitId: unitAId,
				kind: CustomerIdentityKind.EMAIL,
				value: `shared-${marker}@example.test`,
			},
			{
				businessUnitId: unitBId,
				kind: CustomerIdentityKind.EMAIL,
				value: `shared-${marker}@example.test`,
			},
		],
	});
	await db.agentDefinition.create({
		data: {
			id: agentId,
			name: `Agent ${marker}`,
			status: AgentDefinitionStatus.DRAFT,
			createdById: userId,
		},
	});
	await db.agentVersion.create({
		data: {
			id: versionId,
			agentId,
			number: 1,
			status: "READY",
			instructions: "Use only approved CRM actions.",
			manifest: {},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
		},
	});
	await db.conversation.create({
		data: {
			id: conversationId,
			businessUnitId: unitAId,
			channelAccountId: channelAId,
			channel: CommunicationChannel.EMAIL,
			status: ConversationStatus.OPEN,
			priority: ConversationPriority.HIGH,
			subject: `Subject ${marker}`,
			preview: `Preview ${marker}`,
			externalThreadId: `thread-${marker}`,
			contactId,
			companyId,
			dealId,
			bookingId,
			assignedOwnerId: userId,
			assignedAgentId: agentId,
			unreadCount: 1,
			firstMessageAt: new Date("2026-09-05T08:00:00.000Z"),
			lastMessageAt: new Date("2026-09-05T08:10:00.000Z"),
		},
	});
	await db.communicationMessage.create({
		data: {
			id: messageId,
			conversationId,
			channel: CommunicationChannel.EMAIL,
			direction: CommunicationDirection.INBOUND,
			sender: { email: `buyer-${marker}@example.test` },
			recipients: [{ email: `${userId}@example.test` }],
			subject: `Message ${marker}`,
			body: `Activity body ${marker}`,
			snippet: `Snippet ${marker}`,
			sentAt: new Date("2026-09-05T08:10:00.000Z"),
			providerMessageId: `provider-message-${marker}`,
		},
	});
	await db.communicationParticipant.createMany({
		data: [
			{
				conversationId,
				messageId,
				contactId,
				companyId,
				role: CommunicationParticipantRole.SENDER,
				name: `Buyer ${marker}`,
				email: `buyer-${marker}@example.test`,
			},
			{
				conversationId,
				messageId,
				role: CommunicationParticipantRole.RECIPIENT,
				name: "Business OS Stabilizer",
				email: `${userId}@example.test`,
			},
		],
	});
	await db.conversationInsight.create({
		data: {
			conversationId,
			messageId,
			contactId,
			companyId,
			dealId,
			bookingId,
			intent: `intent-${marker}`,
			summary: `Insight ${marker}`,
			needsHumanReview: true,
			confidence: 0.91,
		},
	});
	await db.businessEvent.create({
		data: {
			id: eventId,
			businessUnitId: unitAId,
			type: `communication.received.${marker}`,
			source: BusinessEventSource.GMAIL,
			channel: CommunicationChannel.EMAIL,
			actorType: "contact",
			actorId: contactId,
			contactId,
			companyId,
			dealId,
			bookingId,
			conversationId,
			messageId,
			occurredAt: new Date("2026-09-05T08:10:00.000Z"),
			data: { summary: `Event ${marker}` },
			correlationId: marker,
			idempotencyKey: `event-${marker}`,
			outbox: {
				create: {
					destination: "memory-bridge",
					status: BusinessEventOutboxStatus.PENDING,
					payload: { businessEventId: eventId, marker },
				},
			},
		},
	});
	await db.agentRun.create({
		data: {
			id: runId,
			agentId,
			versionId,
			initiatedById: userId,
			triggerType: AgentTriggerType.MANUAL,
			status: AgentRunStatus.QUEUED,
			idempotencyKey: `run-${marker}`,
			correlationId: `run-correlation-${marker}`,
			input: { businessEventId: eventId },
			summary: "Queued approval review.",
			businessEventId: eventId,
		},
	});
	await db.approvalRequest.create({
		data: {
			id: approvalId,
			businessUnitId: unitAId,
			requestedByAgentId: agentId,
			runId,
			businessEventId: eventId,
			contactId,
			companyId,
			dealId,
			bookingId,
			conversationId,
			messageId,
			type: "email.send",
			summary: `Approve reply ${marker}`,
			proposedAction: {
				type: "email.send",
				to: `buyer-${marker}@example.test`,
			},
			confidence: 0.74,
		},
	});
	await db.agentAction.create({
		data: {
			id: actionId,
			agentId,
			runId,
			type: "email.send",
			provider: "gmail",
			targetType: "contact",
			targetId: contactId,
			targetLabel: `Buyer ${marker}`,
			summary: "Draft reply waits for approval.",
			status: AgentActionStatus.PLANNED,
			idempotencyKey: `action-${marker}`,
			approvalRequired: true,
			approvalRequestId: approvalId,
			evidenceReferences: [{ businessEventId: eventId }],
		},
	});
	await db.agentDecision.create({
		data: {
			id: decisionId,
			agentId,
			runId,
			type: "reply.proposal",
			summary: "Ask for approval before sending.",
			evidence: { businessEventId: eventId },
			confidence: 0.74,
		},
	});
	await db.agentPermission.create({
		data: {
			agentId,
			scope: AgentPermissionScope.SEND,
			target: "email",
		},
	});
	await db.agentSafetyPolicy.create({
		data: {
			businessUnitId: unitAId,
			agentId,
		},
	});
	await db.knowledgeItem.create({
		data: {
			id: knowledgeId,
			businessUnitId: unitAId,
			type: KnowledgeItemType.PRICING,
			title: `Knowledge ${marker}`,
			active: true,
			confidence: 0.95,
			versions: {
				create: [
					{
						version: 1,
						status: KnowledgeVersionStatus.RETIRED,
						content: `Old content ${marker}`,
						createdById: userId,
					},
					{
						version: 2,
						status: KnowledgeVersionStatus.ACTIVE,
						content: `Active content ${marker}`,
						createdById: userId,
						approvedById: userId,
						approvedAt: new Date("2026-09-05T08:00:00.000Z"),
					},
				],
			},
			rules: {
				create: {
					businessUnitId: unitAId,
					type: KnowledgeItemType.PRICING,
					title: `Rule ${marker}`,
					condition: { marker },
					action: { marker },
					active: true,
					priority: 10,
					createdById: userId,
				},
			},
			memoryLinks: {
				create: {
					businessUnitId: unitAId,
					provider: MemoryProvider.MEMO,
					externalMemoryId: `memory-knowledge-${marker}`,
					entityType: MemoryEntityType.KNOWLEDGE_ITEM,
					entityId: knowledgeId,
				},
			},
		},
	});
	await db.externalMemoryLink.create({
		data: {
			businessUnitId: unitAId,
			businessEventId: eventId,
			provider: MemoryProvider.MEMO,
			externalMemoryId: `memory-event-${marker}`,
			entityType: MemoryEntityType.BUSINESS_EVENT,
			entityId: eventId,
		},
	});
	await db.businessTask.create({
		data: {
			businessUnitId: unitAId,
			ownerId: userId,
			assigneeType: "AGENT",
			assignedAgentId: agentId,
			contactId,
			companyId,
			dealId,
			bookingId,
			conversationId,
			sourceEventId: eventId,
			agentRunId: runId,
			title: `Task ${marker}`,
			status: BusinessTaskStatus.TODO,
			priority: BusinessTaskPriority.HIGH,
		},
	});
	await db.automationRule.create({
		data: {
			id: automationId,
			businessUnitId: unitAId,
			name: `Automation ${marker}`,
			status: AutomationRuleStatus.ACTIVE,
			triggerType: "businessEvent",
			conditions: { type: `communication.received.${marker}` },
			actions: { next: "approval" },
			priority: 1,
			createdById: userId,
			executions: {
				create: {
					businessEventId: eventId,
					status: AutomationExecutionStatus.QUEUED,
					input: { marker },
				},
			},
		},
	});
	await db.activity.create({
		data: {
			type: "EMAIL",
			subject: `Activity ${marker}`,
			body: `Activity body ${marker}`,
			companyId,
			contactId,
			dealId,
			createdById: userId,
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
	await db.agentSafetyPolicy.deleteMany({
		where: { agentId },
	});
	await db.agentPermission.deleteMany({
		where: { agentId },
	});
	await db.agentCapability.deleteMany({
		where: { agentId },
	});
	await db.agentRunEvent.deleteMany({
		where: { run: { agentId } },
	});
	await db.agentRun.deleteMany({
		where: { agentId },
	});
	await db.agentDefinition.updateMany({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({
		where: { agentId },
	});
	await db.agentDefinition.deleteMany({
		where: { id: agentId },
	});
	await db.businessEventOutbox.deleteMany({
		where: { businessEvent: { correlationId: marker } },
	});
	await db.businessEvent.deleteMany({
		where: { correlationId: marker },
	});
	await db.conversationInsight.deleteMany({
		where: { summary: { contains: marker } },
	});
	await db.communicationParticipant.deleteMany({
		where: { conversationId },
	});
	await db.communicationMessage.deleteMany({
		where: { conversationId },
	});
	await db.conversation.deleteMany({
		where: { id: conversationId },
	});
	await db.activity.deleteMany({
		where: { subject: { contains: marker } },
	});
	await db.customerIdentity.deleteMany({
		where: { value: { contains: marker } },
	});
	await db.booking.deleteMany({
		where: { id: bookingId },
	});
	await db.dealContact.deleteMany({
		where: { OR: [{ dealId }, { contactId }] },
	});
	await db.deal.deleteMany({
		where: { id: dealId },
	});
	await db.contact.deleteMany({
		where: { id: contactId },
	});
	await db.company.deleteMany({
		where: { id: companyId },
	});
	await db.channelAccount.deleteMany({
		where: { label: { contains: marker } },
	});
	await db.businessUnit.deleteMany({
		where: { slug: { contains: marker } },
	});
	await db.appSetting.deleteMany({
		where: { id: `settings-${marker}` },
	});
	await db.member.deleteMany({
		where: { userId },
	});
	await db.user.deleteMany({
		where: { id: userId },
	});
}
