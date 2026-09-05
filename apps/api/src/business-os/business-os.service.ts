import {
	ApprovalRequestStatus,
	AutomationExecutionStatus,
	AutomationRuleStatus,
	BusinessEventOutboxStatus,
	BusinessTaskStatus,
	ConversationStatus,
	type Db,
	type Prisma,
} from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	type BusinessContext,
	type BusinessContextSource,
	resolveBusinessContext,
} from "./business-context";
import type {
	ApprovalsOutput,
	BusinessOsOverviewOutput,
	ConversationDetailOutput,
	Customer360Output,
	GlobalSearchInput,
	GlobalSearchOutput,
	InboxInput,
	InboxOutput,
	KnowledgeOutput,
	ObservabilityOutput,
} from "./business-os.contracts";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const CONVERSATION_SELECT = {
	id: true,
	channel: true,
	status: true,
	priority: true,
	subject: true,
	preview: true,
	lastMessageAt: true,
	unreadCount: true,
	aiProcessingStatus: true,
	contact: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			imageUrl: true,
		},
	},
	company: {
		select: {
			id: true,
			name: true,
			domain: true,
			iconUrl: true,
			iconDarkUrl: true,
			iconTone: true,
		},
	},
	deal: { select: { id: true, name: true } },
	booking: { select: { id: true, bookingKey: true } },
	assignedOwner: { select: { id: true, name: true } },
	assignedAgent: { select: { id: true, name: true } },
} as const;

const APPROVAL_SELECT = {
	id: true,
	type: true,
	summary: true,
	status: true,
	riskLevel: true,
	confidence: true,
	createdAt: true,
	requestedByAgent: { select: { id: true, name: true } },
} as const;

const INSIGHT_SELECT = {
	id: true,
	intent: true,
	summary: true,
	sentiment: true,
	urgency: true,
	nextAction: true,
	confidence: true,
	needsHumanReview: true,
	processedAt: true,
} as const;

const EVENT_SELECT = {
	id: true,
	type: true,
	source: true,
	channel: true,
	actorType: true,
	actorId: true,
	occurredAt: true,
	data: true,
} as const;

@Injectable()
export class BusinessOsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async overview(
		source: BusinessContextSource,
	): Promise<BusinessOsOverviewOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const since = new Date(Date.now() - RECENT_WINDOW_MS);
		const conversationsWhere = conversationScope(context);
		const approvalsWhere = approvalScope(context);
		const eventsWhere = businessEventScope(context);
		const automationsWhere = automationRuleScope(context);

		const [
			openConversations,
			waitingOnUs,
			needsReview,
			pendingApprovals,
			openTasks,
			queuedOutbox,
			activeKnowledgeItems,
			activeRules,
			activeAutomations,
			recentEventsCount,
			recentConversations,
			pendingApprovalRows,
			recentEvents,
			recentAutomationExecutions,
			settings,
		] = await Promise.all([
			this.db.conversation.count({
				where: {
					AND: [conversationsWhere, { status: ConversationStatus.OPEN }],
				},
			}),
			this.db.conversation.count({
				where: {
					AND: [
						conversationsWhere,
						{ status: ConversationStatus.WAITING_ON_US },
					],
				},
			}),
			this.db.conversationInsight.count({
				where: {
					AND: [conversationInsightScope(context), { needsHumanReview: true }],
				},
			}),
			this.db.approvalRequest.count({
				where: {
					AND: [approvalsWhere, { status: ApprovalRequestStatus.PENDING }],
				},
			}),
			this.db.businessTask.count({
				where: {
					AND: [
						businessTaskScope(context),
						{
							status: {
								in: [BusinessTaskStatus.TODO, BusinessTaskStatus.IN_PROGRESS],
							},
						},
					],
				},
			}),
			this.db.businessEventOutbox.count({
				where: {
					AND: [
						businessEventOutboxScope(context),
						{ status: BusinessEventOutboxStatus.PENDING },
					],
				},
			}),
			this.db.knowledgeItem.count({
				where: { AND: [knowledgeItemScope(context), { active: true }] },
			}),
			this.db.businessRule.count({
				where: { AND: [businessRuleScope(context), { active: true }] },
			}),
			this.db.automationRule.count({
				where: {
					AND: [automationsWhere, { status: AutomationRuleStatus.ACTIVE }],
				},
			}),
			this.db.businessEvent.count({
				where: { AND: [eventsWhere, { occurredAt: { gte: since } }] },
			}),
			this.db.conversation.findMany({
				where: conversationsWhere,
				orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
				take: 8,
				select: CONVERSATION_SELECT,
			}),
			this.db.approvalRequest.findMany({
				where: {
					AND: [approvalsWhere, { status: ApprovalRequestStatus.PENDING }],
				},
				orderBy: { createdAt: "desc" },
				take: 8,
				select: APPROVAL_SELECT,
			}),
			this.db.businessEvent.findMany({
				where: eventsWhere,
				orderBy: { occurredAt: "desc" },
				take: 10,
				select: EVENT_SELECT,
			}),
			this.db.automationExecution.findMany({
				where: automationExecutionScope(context),
				orderBy: { createdAt: "desc" },
				take: 8,
				select: {
					id: true,
					status: true,
					createdAt: true,
					rule: { select: { id: true, name: true } },
				},
			}),
			this.db.appSetting.findFirst({
				select: { aiAutomationKillSwitch: true },
			}),
		]);

		return {
			counts: {
				openConversations,
				waitingOnUs,
				needsReview,
				pendingApprovals,
				openTasks,
				queuedOutbox,
				activeKnowledgeItems,
				activeRules,
				activeAutomations,
				recentEvents: recentEventsCount,
			},
			killSwitch: settings?.aiAutomationKillSwitch ?? false,
			recentConversations: recentConversations.map(conversationSummary),
			pendingApprovals: pendingApprovalRows.map(approvalSummary),
			recentEvents: recentEvents.map(businessEventSummary),
			recentAutomationExecutions: recentAutomationExecutions.map((row) => ({
				id: row.id,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
				rule: { id: row.rule.id, name: row.rule.name },
			})),
		};
	}

	async inbox(
		source: BusinessContextSource,
		input: InboxInput,
	): Promise<InboxOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const conversations = await this.db.conversation.findMany({
			where: {
				AND: [
					conversationScope(context),
					{
						status: input.status,
						channel: input.channel,
					},
				],
			},
			orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
			take: input.limit,
			select: CONVERSATION_SELECT,
		});

		return { conversations: conversations.map(conversationSummary) };
	}

	async conversation(
		source: BusinessContextSource,
		id: string,
	): Promise<ConversationDetailOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const conversation = await this.db.conversation.findFirst({
			where: { AND: [conversationScope(context), { id }] },
			select: CONVERSATION_SELECT,
		});

		if (!conversation) throw new NotFoundException("Conversation not found.");

		const [messages, participants, insights, approvals, events] =
			await Promise.all([
				this.db.communicationMessage.findMany({
					where: {
						AND: [communicationMessageScope(context), { conversationId: id }],
					},
					orderBy: { sentAt: "asc" },
					select: {
						id: true,
						channel: true,
						direction: true,
						sender: true,
						recipients: true,
						subject: true,
						body: true,
						snippet: true,
						sentAt: true,
						aiProcessingStatus: true,
					},
				}),
				this.db.communicationParticipant.findMany({
					where: {
						AND: [
							communicationParticipantScope(context),
							{ conversationId: id },
						],
					},
					orderBy: { createdAt: "asc" },
					take: 100,
					select: {
						id: true,
						role: true,
						name: true,
						email: true,
						phone: true,
						contact: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
								imageUrl: true,
							},
						},
						company: {
							select: {
								id: true,
								name: true,
								domain: true,
								iconUrl: true,
								iconDarkUrl: true,
								iconTone: true,
							},
						},
					},
				}),
				this.db.conversationInsight.findMany({
					where: {
						AND: [conversationInsightScope(context), { conversationId: id }],
					},
					orderBy: { createdAt: "desc" },
					take: 20,
					select: INSIGHT_SELECT,
				}),
				this.db.approvalRequest.findMany({
					where: { AND: [approvalScope(context), { conversationId: id }] },
					orderBy: { createdAt: "desc" },
					take: 20,
					select: APPROVAL_SELECT,
				}),
				this.db.businessEvent.findMany({
					where: { AND: [businessEventScope(context), { conversationId: id }] },
					orderBy: { occurredAt: "desc" },
					take: 50,
					select: EVENT_SELECT,
				}),
			]);

		return {
			conversation: conversationSummary(conversation),
			messages: messages.map((message) => ({
				...message,
				sentAt: message.sentAt.toISOString(),
			})),
			participants: participants.map((participant) => ({
				id: participant.id,
				role: participant.role,
				name: participant.name,
				email: participant.email,
				phone: participant.phone,
				contact: participant.contact
					? contactSummary(participant.contact)
					: null,
				company: participant.company,
			})),
			insights: insights.map(insightSummary),
			approvals: approvals.map(approvalSummary),
			events: events.map(businessEventSummary),
		};
	}

	async customer360(
		source: BusinessContextSource,
		contactId: string,
	): Promise<Customer360Output> {
		const context = await resolveBusinessContext(this.db, source);
		const contact = await this.db.contact.findFirst({
			where: { AND: [contactScope(context), { id: contactId }] },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				imageUrl: true,
				company: {
					select: {
						id: true,
						name: true,
						domain: true,
						iconUrl: true,
						iconDarkUrl: true,
						iconTone: true,
					},
				},
				deals: {
					where: { deal: dealScope(context) },
					take: 20,
					select: {
						role: true,
						deal: {
							select: {
								id: true,
								name: true,
								stage: true,
								amount: true,
								currency: true,
							},
						},
					},
				},
				activities: {
					where: activityScope(context),
					orderBy: { createdAt: "desc" },
					take: 20,
					select: {
						id: true,
						type: true,
						subject: true,
						body: true,
						createdAt: true,
					},
				},
			},
		});

		if (!contact) throw new NotFoundException("Contact not found.");

		const [
			identities,
			conversations,
			insights,
			tasks,
			events,
			approvals,
			knowledgeCount,
			ruleCount,
		] = await Promise.all([
			this.db.customerIdentity.findMany({
				where: { AND: [customerIdentityScope(context), { contactId }] },
				orderBy: { createdAt: "desc" },
				take: 20,
				select: {
					id: true,
					kind: true,
					channel: true,
					value: true,
					status: true,
					confidence: true,
				},
			}),
			this.db.conversation.findMany({
				where: { AND: [conversationScope(context), { contactId }] },
				orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
				take: 20,
				select: CONVERSATION_SELECT,
			}),
			this.db.conversationInsight.findMany({
				where: { AND: [conversationInsightScope(context), { contactId }] },
				orderBy: { createdAt: "desc" },
				take: 20,
				select: INSIGHT_SELECT,
			}),
			this.db.businessTask.findMany({
				where: { AND: [businessTaskScope(context), { contactId }] },
				orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
				take: 20,
				select: {
					id: true,
					title: true,
					status: true,
					priority: true,
					dueAt: true,
					assignedAgent: { select: { id: true, name: true } },
					assignedUser: { select: { id: true, name: true } },
				},
			}),
			this.db.businessEvent.findMany({
				where: { AND: [businessEventScope(context), { contactId }] },
				orderBy: { occurredAt: "desc" },
				take: 20,
				select: EVENT_SELECT,
			}),
			this.db.approvalRequest.findMany({
				where: { AND: [approvalScope(context), { contactId }] },
				orderBy: { createdAt: "desc" },
				take: 20,
				select: APPROVAL_SELECT,
			}),
			this.db.knowledgeItem.count({
				where: { AND: [knowledgeItemScope(context), { active: true }] },
			}),
			this.db.businessRule.count({
				where: { AND: [businessRuleScope(context), { active: true }] },
			}),
		]);

		return {
			contact: contactSummary(contact),
			company: contact.company,
			identities: identities.map((identity) => ({
				...identity,
				kind: identity.kind,
				status: identity.status,
			})),
			conversations: conversations.map(conversationSummary),
			insights: insights.map(insightSummary),
			tasks: tasks.map((task) => ({
				...task,
				dueAt: task.dueAt?.toISOString() ?? null,
				assignedAgent: task.assignedAgent,
				assignedUser: task.assignedUser,
			})),
			events: events.map(businessEventSummary),
			approvals: approvals.map(approvalSummary),
			deals: contact.deals.map(({ role, deal }) => ({
				id: deal.id,
				name: deal.name,
				stage: deal.stage,
				role,
				amountCents: centsOf(deal.amount),
				currency: deal.currency,
			})),
			activity: contact.activities.map((activity) => ({
				id: activity.id,
				type: activity.type,
				subject: activity.subject,
				body: activity.body,
				createdAt: activity.createdAt.toISOString(),
			})),
			readiness: [
				{
					key: "identity",
					label: "Identity",
					ready: identities.length > 0,
					detail:
						identities.length > 0
							? `${identities.length} identity records`
							: "No unified identity is stored",
				},
				{
					key: "conversation",
					label: "Conversations",
					ready: conversations.length > 0,
					detail:
						conversations.length > 0
							? `${conversations.length} unified conversations`
							: "No unified conversation is stored",
				},
				{
					key: "knowledge",
					label: "Knowledge",
					ready: knowledgeCount > 0,
					detail:
						knowledgeCount > 0
							? `${knowledgeCount} active knowledge items`
							: "No active knowledge is stored",
				},
				{
					key: "rules",
					label: "Rules",
					ready: ruleCount > 0,
					detail:
						ruleCount > 0
							? `${ruleCount} active rules`
							: "No active rules are stored",
				},
			],
		};
	}

	async approvals(source: BusinessContextSource): Promise<ApprovalsOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const approvals = await this.db.approvalRequest.findMany({
			where: approvalScope(context),
			orderBy: { createdAt: "desc" },
			take: 50,
			select: APPROVAL_SELECT,
		});

		return { approvals: approvals.map(approvalSummary) };
	}

	async knowledge(source: BusinessContextSource): Promise<KnowledgeOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const [items, rules] = await Promise.all([
			this.db.knowledgeItem.findMany({
				where: knowledgeItemScope(context),
				orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
				take: 100,
				select: {
					id: true,
					type: true,
					title: true,
					active: true,
					source: true,
					confidence: true,
					versions: {
						orderBy: { version: "desc" },
						select: { version: true, status: true },
					},
				},
			}),
			this.db.businessRule.findMany({
				where: businessRuleScope(context),
				orderBy: [{ active: "desc" }, { priority: "desc" }],
				take: 100,
				select: {
					id: true,
					title: true,
					type: true,
					active: true,
					priority: true,
				},
			}),
		]);

		return {
			items: items.map((item) => ({
				id: item.id,
				type: item.type,
				title: item.title,
				active: item.active,
				source: item.source,
				confidence: item.confidence,
				versions: item.versions.length,
				activeVersion:
					item.versions.find((version) => version.status === "ACTIVE")
						?.version ?? null,
			})),
			rules,
		};
	}

	async observability(
		source: BusinessContextSource,
	): Promise<ObservabilityOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const [outbox, executions, rules] = await Promise.all([
			this.db.businessEventOutbox.groupBy({
				by: ["status"],
				where: businessEventOutboxScope(context),
				_count: { _all: true },
			}),
			this.db.automationExecution.groupBy({
				by: ["status"],
				where: automationExecutionScope(context),
				_count: { _all: true },
			}),
			this.db.automationRule.groupBy({
				by: ["status"],
				where: automationRuleScope(context),
				_count: { _all: true },
			}),
		]);

		return {
			outbox: {
				pending: countGroup(outbox, BusinessEventOutboxStatus.PENDING),
				sending: countGroup(outbox, BusinessEventOutboxStatus.SENDING),
				sent: countGroup(outbox, BusinessEventOutboxStatus.SENT),
				failed: countGroup(outbox, BusinessEventOutboxStatus.FAILED),
				cancelled: countGroup(outbox, BusinessEventOutboxStatus.CANCELLED),
			},
			automationExecutions: {
				queued: countGroup(executions, AutomationExecutionStatus.QUEUED),
				running: countGroup(executions, AutomationExecutionStatus.RUNNING),
				waitingForApproval: countGroup(
					executions,
					AutomationExecutionStatus.WAITING_FOR_APPROVAL,
				),
				succeeded: countGroup(executions, AutomationExecutionStatus.SUCCEEDED),
				failed: countGroup(executions, AutomationExecutionStatus.FAILED),
				cancelled: countGroup(executions, AutomationExecutionStatus.CANCELLED),
			},
			automationRules: {
				draft: countGroup(rules, AutomationRuleStatus.DRAFT),
				active: countGroup(rules, AutomationRuleStatus.ACTIVE),
				paused: countGroup(rules, AutomationRuleStatus.PAUSED),
				archived: countGroup(rules, AutomationRuleStatus.ARCHIVED),
			},
		};
	}

	async globalSearch(
		source: BusinessContextSource,
		input: GlobalSearchInput,
	): Promise<GlobalSearchOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const term = input.q.trim();
		if (term.length < 2) return { hits: [] };

		const contains = { contains: term, mode: "insensitive" as const };
		const [
			companies,
			contacts,
			deals,
			bookings,
			conversations,
			messages,
			activities,
			knowledge,
			events,
		] = await Promise.all([
			this.db.company.findMany({
				where: {
					AND: [
						companyScope(context),
						{
							OR: [
								{ name: contains },
								{ domain: contains },
								{ email: contains },
							],
						},
					],
				},
				orderBy: { name: "asc" },
				take: input.limit,
				select: { id: true, name: true, domain: true },
			}),
			this.db.contact.findMany({
				where: {
					AND: [
						contactScope(context),
						{
							OR: [
								{ firstName: contains },
								{ lastName: contains },
								{ email: contains },
								{ phone: contains },
							],
						},
					],
				},
				orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
				take: input.limit,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					imageUrl: true,
				},
			}),
			this.db.deal.findMany({
				where: { AND: [dealScope(context), { name: contains }] },
				orderBy: { name: "asc" },
				take: input.limit,
				select: { id: true, name: true, stage: true },
			}),
			this.db.booking.findMany({
				where: {
					AND: [
						bookingScope(context),
						{
							OR: [
								{ bookingKey: contains },
								{ deal: { name: contains } },
								{ googleCalendarEventId: contains },
							],
						},
					],
				},
				orderBy: { eventDate: "desc" },
				take: input.limit,
				select: {
					id: true,
					bookingKey: true,
					eventDate: true,
					deal: { select: { name: true } },
				},
			}),
			this.db.conversation.findMany({
				where: {
					AND: [
						conversationScope(context),
						{ OR: [{ subject: contains }, { preview: contains }] },
					],
				},
				orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
				take: input.limit,
				select: { id: true, subject: true, preview: true, lastMessageAt: true },
			}),
			this.db.communicationMessage.findMany({
				where: {
					AND: [
						communicationMessageScope(context),
						{
							OR: [
								{ subject: contains },
								{ snippet: contains },
								{ body: contains },
							],
						},
					],
				},
				orderBy: { sentAt: "desc" },
				take: input.limit,
				select: { id: true, subject: true, snippet: true, sentAt: true },
			}),
			this.db.activity.findMany({
				where: {
					AND: [
						activityScope(context),
						{ OR: [{ subject: contains }, { body: contains }] },
					],
				},
				orderBy: { createdAt: "desc" },
				take: input.limit,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					createdAt: true,
				},
			}),
			this.db.knowledgeItem.findMany({
				where: { AND: [knowledgeItemScope(context), { title: contains }] },
				orderBy: { updatedAt: "desc" },
				take: input.limit,
				select: { id: true, type: true, title: true, updatedAt: true },
			}),
			this.db.businessEvent.findMany({
				where: { AND: [businessEventScope(context), { type: contains }] },
				orderBy: { occurredAt: "desc" },
				take: input.limit,
				select: { id: true, type: true, source: true, occurredAt: true },
			}),
		]);

		return {
			hits: [
				...companies.map((company) => ({
					kind: "company" as const,
					id: company.id,
					label: company.name,
					detail: company.domain,
					occurredAt: null,
				})),
				...contacts.map((contact) => ({
					kind: "contact" as const,
					id: contact.id,
					label: contactName(contact),
					detail: contact.email,
					occurredAt: null,
				})),
				...deals.map((deal) => ({
					kind: "deal" as const,
					id: deal.id,
					label: deal.name,
					detail: deal.stage,
					occurredAt: null,
				})),
				...bookings.map((booking) => ({
					kind: "booking" as const,
					id: booking.id,
					label: booking.deal.name,
					detail: booking.bookingKey,
					occurredAt: booking.eventDate.toISOString(),
				})),
				...conversations.map((conversation) => ({
					kind: "conversation" as const,
					id: conversation.id,
					label: conversation.subject ?? "Conversation",
					detail: conversation.preview,
					occurredAt: conversation.lastMessageAt?.toISOString() ?? null,
				})),
				...messages.map((message) => ({
					kind: "message" as const,
					id: message.id,
					label: message.subject ?? "Message",
					detail: message.snippet,
					occurredAt: message.sentAt.toISOString(),
				})),
				...activities.map((activity) => ({
					kind: "activity" as const,
					id: activity.id,
					label: activity.subject ?? activity.type,
					detail: activity.body,
					occurredAt: activity.createdAt.toISOString(),
				})),
				...knowledge.map((item) => ({
					kind: "knowledge" as const,
					id: item.id,
					label: item.title,
					detail: item.type,
					occurredAt: item.updatedAt.toISOString(),
				})),
				...events.map((event) => ({
					kind: "event" as const,
					id: event.id,
					label: event.type,
					detail: event.source,
					occurredAt: event.occurredAt.toISOString(),
				})),
			],
		};
	}
}

type DirectBusinessUnitScope = {
	businessUnitId?: string | null;
	OR?: { businessUnitId: string | null }[];
};

function directBusinessUnitScope(
	context: BusinessContext,
): DirectBusinessUnitScope {
	if (context.includeUnscoped) {
		return {
			OR: [
				{ businessUnitId: context.businessUnitId },
				{ businessUnitId: null },
			],
		};
	}

	return { businessUnitId: context.businessUnitId };
}

function customerIdentityScope(
	context: BusinessContext,
): Prisma.CustomerIdentityWhereInput {
	return directBusinessUnitScope(context);
}

function conversationScope(
	context: BusinessContext,
): Prisma.ConversationWhereInput {
	if (context.includeUnscoped) {
		return directBusinessUnitScope(context);
	}

	return {
		OR: [
			{ businessUnitId: context.businessUnitId },
			{
				businessUnitId: null,
				channelAccount: { businessUnitId: context.businessUnitId },
			},
		],
	};
}

function communicationMessageScope(
	context: BusinessContext,
): Prisma.CommunicationMessageWhereInput {
	return { conversation: conversationScope(context) };
}

function communicationParticipantScope(
	context: BusinessContext,
): Prisma.CommunicationParticipantWhereInput {
	return { conversation: conversationScope(context) };
}

function conversationInsightScope(
	context: BusinessContext,
): Prisma.ConversationInsightWhereInput {
	return { conversation: conversationScope(context) };
}

function businessEventScope(
	context: BusinessContext,
): Prisma.BusinessEventWhereInput {
	if (context.includeUnscoped) {
		return directBusinessUnitScope(context);
	}

	return {
		OR: [
			{ businessUnitId: context.businessUnitId },
			{
				businessUnitId: null,
				conversation: conversationScope(context),
			},
		],
	};
}

function approvalScope(
	context: BusinessContext,
): Prisma.ApprovalRequestWhereInput {
	if (context.includeUnscoped) {
		return directBusinessUnitScope(context);
	}

	return {
		OR: [
			{ businessUnitId: context.businessUnitId },
			{
				businessUnitId: null,
				conversation: conversationScope(context),
			},
			{
				businessUnitId: null,
				businessEvent: businessEventScope(context),
			},
		],
	};
}

function knowledgeItemScope(
	context: BusinessContext,
): Prisma.KnowledgeItemWhereInput {
	return directBusinessUnitScope(context);
}

function businessRuleScope(
	context: BusinessContext,
): Prisma.BusinessRuleWhereInput {
	if (context.includeUnscoped) {
		return directBusinessUnitScope(context);
	}

	return {
		OR: [
			{ businessUnitId: context.businessUnitId },
			{
				businessUnitId: null,
				knowledgeItem: knowledgeItemScope(context),
			},
		],
	};
}

function businessTaskScope(
	context: BusinessContext,
): Prisma.BusinessTaskWhereInput {
	if (context.includeUnscoped) {
		return directBusinessUnitScope(context);
	}

	return {
		OR: [
			{ businessUnitId: context.businessUnitId },
			{
				businessUnitId: null,
				conversation: conversationScope(context),
			},
			{
				businessUnitId: null,
				sourceEvent: businessEventScope(context),
			},
		],
	};
}

function automationRuleScope(
	context: BusinessContext,
): Prisma.AutomationRuleWhereInput {
	return directBusinessUnitScope(context);
}

function automationExecutionScope(
	context: BusinessContext,
): Prisma.AutomationExecutionWhereInput {
	return {
		OR: [
			{ rule: automationRuleScope(context) },
			{ businessEvent: businessEventScope(context) },
		],
	};
}

function businessEventOutboxScope(
	context: BusinessContext,
): Prisma.BusinessEventOutboxWhereInput {
	return { businessEvent: businessEventScope(context) };
}

function bookingScope(context: BusinessContext): Prisma.BookingWhereInput {
	if (context.includeUnscoped) return {};

	return {
		OR: [
			{ communicationConversations: { some: conversationScope(context) } },
			{ businessEvents: { some: businessEventScope(context) } },
			{ approvalRequests: { some: directBusinessUnitScope(context) } },
			{ businessTasks: { some: directBusinessUnitScope(context) } },
		],
	};
}

function dealScope(context: BusinessContext): Prisma.DealWhereInput {
	if (context.includeUnscoped) return {};

	return {
		OR: [
			{ communicationConversations: { some: conversationScope(context) } },
			{ businessEvents: { some: businessEventScope(context) } },
			{ approvalRequests: { some: directBusinessUnitScope(context) } },
			{ businessTasks: { some: directBusinessUnitScope(context) } },
		],
	};
}

function companyScope(context: BusinessContext): Prisma.CompanyWhereInput {
	if (context.includeUnscoped) return {};

	return {
		OR: [
			{ customerIdentities: { some: customerIdentityScope(context) } },
			{ communicationConversations: { some: conversationScope(context) } },
			{ businessEvents: { some: businessEventScope(context) } },
			{ approvalRequests: { some: directBusinessUnitScope(context) } },
			{ businessTasks: { some: directBusinessUnitScope(context) } },
		],
	};
}

function contactScope(context: BusinessContext): Prisma.ContactWhereInput {
	if (context.includeUnscoped) return {};

	return {
		OR: [
			{ customerIdentities: { some: customerIdentityScope(context) } },
			{ communicationConversations: { some: conversationScope(context) } },
			{ businessEvents: { some: businessEventScope(context) } },
			{ approvalRequests: { some: directBusinessUnitScope(context) } },
			{ businessTasks: { some: directBusinessUnitScope(context) } },
		],
	};
}

function activityScope(context: BusinessContext): Prisma.ActivityWhereInput {
	if (context.includeUnscoped) return {};

	return {
		OR: [
			{ emailThread: { conversation: conversationScope(context) } },
			{
				contact: {
					customerIdentities: { some: customerIdentityScope(context) },
				},
			},
			{
				company: {
					customerIdentities: { some: customerIdentityScope(context) },
				},
			},
			{ deal: dealScope(context) },
		],
	};
}

function contactName(contact: {
	firstName: string;
	lastName: string | null;
	email?: string | null;
}): string {
	return (
		[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
		contact.email ||
		"Unnamed"
	);
}

function contactSummary(contact: {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	imageUrl: string | null;
}) {
	return {
		id: contact.id,
		name: contactName(contact),
		email: contact.email,
		imageUrl: contact.imageUrl,
	};
}

function conversationSummary(
	conversation: Prisma.ConversationGetPayload<{
		select: typeof CONVERSATION_SELECT;
	}>,
) {
	return {
		id: conversation.id,
		channel: conversation.channel,
		status: conversation.status,
		priority: conversation.priority,
		subject: conversation.subject,
		preview: conversation.preview,
		lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
		unreadCount: conversation.unreadCount,
		aiProcessingStatus: conversation.aiProcessingStatus,
		contact: conversation.contact ? contactSummary(conversation.contact) : null,
		company: conversation.company,
		deal: conversation.deal,
		booking: conversation.booking
			? { id: conversation.booking.id, name: conversation.booking.bookingKey }
			: null,
		assignedOwner: conversation.assignedOwner,
		assignedAgent: conversation.assignedAgent,
	};
}

function approvalSummary(
	approval: Prisma.ApprovalRequestGetPayload<{
		select: typeof APPROVAL_SELECT;
	}>,
) {
	return {
		id: approval.id,
		type: approval.type,
		summary: approval.summary,
		status: approval.status,
		riskLevel: approval.riskLevel,
		confidence: approval.confidence,
		createdAt: approval.createdAt.toISOString(),
		requestedByAgent: approval.requestedByAgent,
	};
}

function insightSummary(
	insight: Prisma.ConversationInsightGetPayload<{
		select: typeof INSIGHT_SELECT;
	}>,
) {
	return {
		...insight,
		processedAt: insight.processedAt?.toISOString() ?? null,
	};
}

function businessEventSummary(
	event: Prisma.BusinessEventGetPayload<{ select: typeof EVENT_SELECT }>,
) {
	return {
		...event,
		occurredAt: event.occurredAt.toISOString(),
	};
}

function centsOf(value: { toString(): string } | null): number | null {
	if (!value) return null;
	return Math.round(Number(value.toString()) * 100);
}

function countGroup<T extends string>(
	rows: { status: T; _count: { _all: number } }[],
	status: T,
): number {
	return rows.find((row) => row.status === status)?._count._all ?? 0;
}
