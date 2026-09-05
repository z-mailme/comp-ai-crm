import {
	AiProcessingStatus,
	ApprovalRequestStatus,
	AutomationExecutionStatus,
	AutomationRuleStatus,
	BusinessEventOutboxStatus,
	BusinessEventSource,
	BusinessTaskPriority,
	BusinessTaskStatus,
	CommunicationChannel,
	CommunicationDirection,
	ConversationPriority,
	ConversationStatus,
	KnowledgeItemType,
} from "@crm/db";
import { z } from "zod";

export const businessOsLimitInput = z.object({
	limit: z.number().int().min(1).max(100).default(50),
});

export const inboxInput = businessOsLimitInput.extend({
	status: z.nativeEnum(ConversationStatus).optional(),
	channel: z.nativeEnum(CommunicationChannel).optional(),
});

export const conversationInput = z.object({ id: z.string() });

export const customer360Input = z.object({ contactId: z.string() });

export const globalSearchInput = z.object({
	q: z.string().default(""),
	limit: z.number().int().min(1).max(25).default(8),
});

const linkedRecordOutput = z.object({
	id: z.string(),
	name: z.string(),
});

const linkedContactOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

const linkedCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
});

const conversationBriefOutput = z.object({
	id: z.string(),
	channel: z.nativeEnum(CommunicationChannel),
	status: z.nativeEnum(ConversationStatus),
	priority: z.nativeEnum(ConversationPriority),
	subject: z.string().nullable(),
	preview: z.string().nullable(),
	lastMessageAt: z.string().nullable(),
	unreadCount: z.number(),
	aiProcessingStatus: z.nativeEnum(AiProcessingStatus),
	contact: linkedContactOutput.nullable(),
	company: linkedCompanyOutput.nullable(),
	deal: linkedRecordOutput.nullable(),
	booking: linkedRecordOutput.nullable(),
	assignedOwner: linkedRecordOutput.nullable(),
	assignedAgent: linkedRecordOutput.nullable(),
});

const communicationMessageOutput = z.object({
	id: z.string(),
	channel: z.nativeEnum(CommunicationChannel),
	direction: z.nativeEnum(CommunicationDirection),
	sender: z.unknown(),
	recipients: z.unknown(),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	snippet: z.string().nullable(),
	sentAt: z.string(),
	aiProcessingStatus: z.nativeEnum(AiProcessingStatus),
});

const communicationParticipantOutput = z.object({
	id: z.string(),
	role: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	contact: linkedContactOutput.nullable(),
	company: linkedCompanyOutput.nullable(),
});

const businessEventOutput = z.object({
	id: z.string(),
	type: z.string(),
	source: z.nativeEnum(BusinessEventSource),
	channel: z.nativeEnum(CommunicationChannel).nullable(),
	actorType: z.string().nullable(),
	actorId: z.string().nullable(),
	occurredAt: z.string(),
	data: z.unknown(),
});

const approvalOutput = z.object({
	id: z.string(),
	type: z.string(),
	summary: z.string(),
	status: z.nativeEnum(ApprovalRequestStatus),
	riskLevel: z.string(),
	confidence: z.number().nullable(),
	createdAt: z.string(),
	requestedByAgent: linkedRecordOutput.nullable(),
});

const insightOutput = z.object({
	id: z.string(),
	intent: z.string().nullable(),
	summary: z.string().nullable(),
	sentiment: z.string().nullable(),
	urgency: z.string().nullable(),
	nextAction: z.string().nullable(),
	confidence: z.number().nullable(),
	needsHumanReview: z.boolean(),
	processedAt: z.string().nullable(),
});

const taskOutput = z.object({
	id: z.string(),
	title: z.string(),
	status: z.nativeEnum(BusinessTaskStatus),
	priority: z.nativeEnum(BusinessTaskPriority),
	dueAt: z.string().nullable(),
	assignedAgent: linkedRecordOutput.nullable(),
	assignedUser: linkedRecordOutput.nullable(),
});

export const businessOsOverviewOutput = z.object({
	counts: z.object({
		openConversations: z.number(),
		waitingOnUs: z.number(),
		needsReview: z.number(),
		pendingApprovals: z.number(),
		openTasks: z.number(),
		queuedOutbox: z.number(),
		activeKnowledgeItems: z.number(),
		activeRules: z.number(),
		activeAutomations: z.number(),
		recentEvents: z.number(),
	}),
	killSwitch: z.boolean(),
	recentConversations: z.array(conversationBriefOutput),
	pendingApprovals: z.array(approvalOutput),
	recentEvents: z.array(businessEventOutput),
	recentAutomationExecutions: z.array(
		z.object({
			id: z.string(),
			status: z.nativeEnum(AutomationExecutionStatus),
			createdAt: z.string(),
			rule: linkedRecordOutput,
		}),
	),
});

export const inboxOutput = z.object({
	conversations: z.array(conversationBriefOutput),
});

export const conversationDetailOutput = z.object({
	conversation: conversationBriefOutput,
	messages: z.array(communicationMessageOutput),
	participants: z.array(communicationParticipantOutput),
	insights: z.array(insightOutput),
	approvals: z.array(approvalOutput),
	events: z.array(businessEventOutput),
});

export const customer360Output = z.object({
	contact: linkedContactOutput,
	company: linkedCompanyOutput.nullable(),
	identities: z.array(
		z.object({
			id: z.string(),
			kind: z.string(),
			channel: z.nativeEnum(CommunicationChannel).nullable(),
			value: z.string(),
			status: z.string(),
			confidence: z.number().nullable(),
		}),
	),
	conversations: z.array(conversationBriefOutput),
	insights: z.array(insightOutput),
	tasks: z.array(taskOutput),
	events: z.array(businessEventOutput),
	approvals: z.array(approvalOutput),
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			stage: z.string(),
			role: z.string().nullable(),
			amountCents: z.number().nullable(),
			currency: z.string(),
		}),
	),
	activity: z.array(
		z.object({
			id: z.string(),
			type: z.string(),
			subject: z.string().nullable(),
			body: z.string().nullable(),
			createdAt: z.string(),
		}),
	),
	readiness: z.array(
		z.object({
			key: z.string(),
			label: z.string(),
			ready: z.boolean(),
			detail: z.string(),
		}),
	),
});

export const globalSearchOutput = z.object({
	hits: z.array(
		z.object({
			kind: z.enum([
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
			id: z.string(),
			label: z.string(),
			detail: z.string().nullable(),
			occurredAt: z.string().nullable(),
		}),
	),
});

export const approvalsOutput = z.object({
	approvals: z.array(approvalOutput),
});

export const knowledgeOutput = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			type: z.nativeEnum(KnowledgeItemType),
			title: z.string(),
			active: z.boolean(),
			source: z.string().nullable(),
			confidence: z.number().nullable(),
			versions: z.number(),
			activeVersion: z.number().nullable(),
		}),
	),
	rules: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			type: z.nativeEnum(KnowledgeItemType),
			active: z.boolean(),
			priority: z.number(),
		}),
	),
});

export const observabilityOutput = z.object({
	outbox: z.object({
		pending: z.number(),
		sending: z.number(),
		sent: z.number(),
		failed: z.number(),
		cancelled: z.number(),
	}),
	automationExecutions: z.object({
		queued: z.number(),
		running: z.number(),
		waitingForApproval: z.number(),
		succeeded: z.number(),
		failed: z.number(),
		cancelled: z.number(),
	}),
	automationRules: z.object({
		draft: z.number(),
		active: z.number(),
		paused: z.number(),
		archived: z.number(),
	}),
});

export type BusinessOsOverviewOutput = z.infer<typeof businessOsOverviewOutput>;
export type InboxInput = z.infer<typeof inboxInput>;
export type InboxOutput = z.infer<typeof inboxOutput>;
export type ConversationDetailOutput = z.infer<typeof conversationDetailOutput>;
export type Customer360Output = z.infer<typeof customer360Output>;
export type GlobalSearchInput = z.infer<typeof globalSearchInput>;
export type GlobalSearchOutput = z.infer<typeof globalSearchOutput>;
export type ApprovalsOutput = z.infer<typeof approvalsOutput>;
export type KnowledgeOutput = z.infer<typeof knowledgeOutput>;
export type ObservabilityOutput = z.infer<typeof observabilityOutput>;

export const OUTBOX_STATUSES = Object.values(BusinessEventOutboxStatus);
export const AUTOMATION_EXECUTION_STATUSES = Object.values(
	AutomationExecutionStatus,
);
export const AUTOMATION_RULE_STATUSES = Object.values(AutomationRuleStatus);
