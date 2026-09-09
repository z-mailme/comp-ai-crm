import { ActivityType, BusinessEventSource, db, type Prisma } from "@crm/db";
import { currentKnowledge } from "@crm/db/knowledge";
import { readPopAutoAcknowledge } from "@crm/db/settings";
import { agentEventTriggerConfig } from "@crm/validation/agent-manifest";
import { z } from "zod";
import { DISPATCH } from "./dispatch-config";
import { detectPop } from "./pop-detect";

const BOOKING_MATCH_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

const COMMUNICATION_EVENT_TYPES = {
	"communication.received": "communication.received",
	"communication.sent": "communication.sent",
	POP_RECEIVED: "pop.received",
} as const;

export type BridgeOutcome = {
	processed: number;
	pops: number;
	failed: number;
};

export async function drainMemoryBridge(options?: {
	send?: AcknowledgementSender;
}): Promise<BridgeOutcome> {
	const send = options?.send ?? sendAcknowledgementViaApi;

	const rows = await db.businessEventOutbox.findMany({
		where: {
			destination: "memory-bridge",
			status: "PENDING",
			OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
		},
		orderBy: { createdAt: "asc" },
		take: DISPATCH.bridge.batchSize,
		select: {
			id: true,
			businessEventId: true,
			businessEvent: {
				select: {
					id: true,
					type: true,
					occurredAt: true,
					contactId: true,
					companyId: true,
					dealId: true,
					conversationId: true,
					messageId: true,
					actorUserId: true,
					message: {
						select: {
							subject: true,
							body: true,
							sender: true,
							sentAt: true,
						},
					},
				},
			},
		},
	});

	let processed = 0;
	let pops = 0;
	let failed = 0;

	for (const row of rows) {
		const claimed = await db.businessEventOutbox.updateMany({
			where: { id: row.id, status: "PENDING" },
			data: { status: "SENDING", attemptCount: { increment: 1 } },
		});
		if (claimed.count === 0) continue;

		try {
			const pop = await processEvent(row.businessEvent, send);

			await db.businessEventOutbox.updateMany({
				where: { id: row.id },
				data: { status: "SENT", sentAt: new Date() },
			});

			processed += 1;
			if (pop) pops += 1;
		} catch (error) {
			failed += 1;
			const reason = error instanceof Error ? error.message : String(error);
			const attempt = await db.businessEventOutbox.findUnique({
				where: { id: row.id },
				select: { attemptCount: true },
			});

			const exhausted =
				(attempt?.attemptCount ?? 1) >= DISPATCH.bridge.maxAttempts;

			await db.businessEventOutbox.updateMany({
				where: { id: row.id },
				data: {
					status: exhausted ? "FAILED" : "PENDING",
					lastError: reason,
					nextAttemptAt: new Date(Date.now() + DISPATCH.bridge.retryBackoffMs),
				},
			});
		}
	}

	return { processed, pops, failed };
}

async function processEvent(
	event: {
		id: string;
		type: string;
		occurredAt: Date;
		contactId: string | null;
		companyId: string | null;
		dealId: string | null;
		conversationId: string | null;
		messageId: string | null;
		actorUserId: string | null;
		message: {
			subject: string | null;
			body: string | null;
			sender: unknown;
			sentAt: Date | null;
		} | null;
	},
	send: AcknowledgementSender,
): Promise<boolean> {
	const triggerType =
		COMMUNICATION_EVENT_TYPES[
			event.type as keyof typeof COMMUNICATION_EVENT_TYPES
		];

	if (triggerType) {
		await queueAgentTriggers(event, triggerType);
	}

	if (event.type !== "communication.received" || !event.message) {
		return false;
	}

	const detection = detectPop(event.message.subject, event.message.body);
	if (!detection) return false;

	const booking = await matchBooking(event.contactId, event.companyId);

	const popEvent = await db.businessEvent.upsert({
		where: { idempotencyKey: `pop:${event.id}` },
		create: {
			type: "POP_RECEIVED",
			source: BusinessEventSource.AGENT,
			contactId: event.contactId,
			companyId: event.companyId,
			dealId: event.dealId ?? booking?.dealId ?? null,
			bookingId: booking?.id ?? null,
			conversationId: event.conversationId,
			messageId: event.messageId,
			occurredAt: event.occurredAt,
			data: {
				amount: detection.amount,
				currency: detection.currency,
				reference: detection.reference,
				evidence: detection.evidence,
				paymentConfirmed: false,
				suggestedAcknowledgement: await acknowledgementFor(
					detection.amount,
					event.contactId,
					event.companyId,
				),
			},
			correlationId: event.id,
			idempotencyKey: `pop:${event.id}`,
		},
		update: {},
	});

	const summary = detection.amount
		? `Proof of payment received — R${detection.amount.toLocaleString("en-ZA")}`
		: "Proof of payment received";

	const authorId =
		event.actorUserId ??
		(await activityAuthor(event.contactId, event.companyId));

	if (authorId) {
		const existingNote = await db.activity.findFirst({
			where: {
				type: ActivityType.NOTE,
				meta: { path: ["sourceEventId"], equals: event.id },
			},
			select: { id: true },
		});

		if (!existingNote) {
			await db.activity.create({
				data: {
					type: ActivityType.NOTE,
					subject: summary,
					body: `Payment is not confirmed until it reconciles. Evidence: ${detection.evidence}.`,
					occurredAt: event.occurredAt,
					contactId: event.contactId,
					companyId: event.companyId,
					dealId: event.dealId ?? booking?.dealId ?? null,
					createdById: authorId,
					meta: {
						source: "pop-bridge",
						sourceEventId: event.id,
						paymentConfirmed: false,
						bookingId: booking?.id ?? null,
					},
				},
			});
		}
	}

	await queueAgentTriggers(event, "pop.received");

	await evaluateSafeAuto(popEvent, event, detection, send);

	return true;
}

async function activityAuthor(
	contactId: string | null,
	companyId: string | null,
): Promise<string | null> {
	if (contactId) {
		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { ownerId: true },
		});
		if (contact?.ownerId) return contact.ownerId;
	}

	if (companyId) {
		const company = await db.company.findUnique({
			where: { id: companyId },
			select: { ownerId: true },
		});
		if (company?.ownerId) return company.ownerId;
	}

	return db.user
		.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } })
		.then((user) => user?.id ?? null);
}

async function matchBooking(
	contactId: string | null,
	companyId: string | null,
): Promise<{ id: string; dealId: string } | null> {
	if (!contactId && !companyId) return null;

	const since = new Date(Date.now() - BOOKING_MATCH_WINDOW_MS);

	const booking = await db.booking.findFirst({
		where: {
			status: { notIn: ["CANCELLED"] },
			eventDate: { gte: since },
			deal: {
				OR: [
					...(contactId ? [{ contacts: { some: { contactId } } }] : []),
					...(companyId ? [{ companyId }] : []),
				],
			},
		},
		orderBy: { eventDate: "desc" },
		select: { id: true, dealId: true },
	});

	return booking;
}

async function acknowledgementFor(
	amount: number | null,
	contactId: string | null,
	companyId: string | null,
): Promise<string> {
	const style = contactId
		? await currentKnowledge(db, {
				kind: "COMMUNICATION_STYLE",
				contactId,
				limit: 1,
			})
		: companyId
			? await currentKnowledge(db, {
					kind: "COMMUNICATION_STYLE",
					companyId,
					limit: 1,
				})
			: [];

	const amountText = amount ? ` of R${amount.toLocaleString("en-ZA")}` : "";

	const tone = style[0]?.subject?.toLowerCase() ?? "";

	if (/formal|brief|professional/.test(tone)) {
		return `Thank you. We have received your proof of payment${amountText}. We will confirm once it reflects on our bank statement.`;
	}

	if (/warm|friendly|casual/.test(tone)) {
		return `Thank you — we have received your proof of payment${amountText}. We will confirm once it reflects on our bank statement. We appreciate it.`;
	}

	return `Thank you — we have received your proof of payment${amountText}. We will confirm once it reflects on our bank statement.`;
}

async function queueAgentTriggers(
	event: {
		id: string;
		occurredAt: Date;
		contactId: string | null;
	},
	eventType: string,
): Promise<number> {
	if (!event.contactId) return 0;

	const triggers = await db.agentTrigger.findMany({
		where: {
			enabled: true,
			type: "EVENT",
			agent: { status: "LIVE" },
		},
		select: { id: true, config: true },
	});

	const matching = triggers.filter((trigger) => {
		const config = agentEventTriggerConfig.safeParse(trigger.config);
		return config.success && config.data.event === eventType;
	});

	if (matching.length === 0) return 0;

	const existing = await db.agentTask.findFirst({
		where: {
			kind: "agent-event",
			contactId: event.contactId,
			payload: { path: ["data", "eventId"], equals: event.id },
		},
		select: { id: true },
	});
	if (existing) return 0;

	await db.agentTask.create({
		data: {
			kind: "agent-event",
			reason: eventType,
			contactId: event.contactId,
			payload: {
				type: eventType,
				record: { kind: "contact", id: event.contactId },
				occurredAt: event.occurredAt.toISOString(),
				data: { eventId: event.id },
			} as Prisma.InputJsonValue,
			priority: 5,
			budget: 1,
			dueAt: new Date(),
		},
	});

	return 1;
}

const DISPUTE_SIGNAL = /refund|dispute|angry|unhappy|complain|cancel/i;

type AcknowledgementSender = (eventId: string) => Promise<string>;

const bridgeEventData = z
	.object({
		acknowledgementApproved: z.boolean().catch(false),
	})
	.passthrough()
	.catch({ acknowledgementApproved: false });

async function evaluateSafeAuto(
	popEvent: { id: string },
	event: {
		contactId: string | null;
		message: { subject: string | null; body: string | null } | null;
	},
	detection: { amount: number | null; reference: string | null },
	send: AcknowledgementSender,
): Promise<void> {
	const conditions = {
		strongDetection: detection.amount !== null && detection.reference !== null,
		senderIdentified: event.contactId !== null,
		noDispute: !DISPUTE_SIGNAL.test(
			`${event.message?.subject ?? ""} ${event.message?.body ?? ""}`,
		),
	};

	if (!Object.values(conditions).every(Boolean)) return;

	if (!(await readPopAutoAcknowledge(db))) return;

	const delivered = await db.businessEvent.findFirst({
		where: {
			type: "pop.acknowledgement.sent",
			correlationId: popEvent.id,
		},
		select: { id: true },
	});
	if (delivered) return;

	const current = await db.businessEvent.findUnique({
		where: { id: popEvent.id },
		select: { data: true },
	});

	const data = bridgeEventData.parse(current?.data ?? {});
	if (!data.acknowledgementApproved) {
		await db.businessEvent.update({
			where: { id: popEvent.id },
			data: {
				data: {
					...data,
					acknowledgementApproved: true,
				} as Prisma.InputJsonValue,
			},
		});
	}

	await send(popEvent.id);
}

const acknowledgementResult = z
	.object({
		status: z.enum(["sent", "already-sent", "skipped", "failed"]),
		reason: z.string().nullable().catch(null),
	})
	.catch({ status: "failed", reason: null });

export async function sendAcknowledgementViaApi(
	eventId: string,
): Promise<string> {
	const base = process.env.API_URL?.trim() || "http://localhost:3001";
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();

	if (!secret) {
		throw new Error(
			"AGENT_BRIDGE_SECRET is not set; acknowledgement stays a draft.",
		);
	}

	const response = await fetch(`${base}/internal/gmail/pop-acknowledgement`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${secret}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ eventId }),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		throw new Error(`The API answered HTTP ${response.status}.`);
	}

	const body = await response.json().catch(() => null);
	const result = acknowledgementResult.parse(body ?? {});

	if (result.status === "sent" || result.status === "already-sent") {
		return result.status;
	}

	throw new Error(
		`The API did not send the acknowledgement: ${result.status}${
			result.reason ? ` — ${result.reason}` : ""
		}.`,
	);
}
