import { ActivityType, BusinessEventSource, db } from "@crm/db";
import { currentKnowledge } from "@crm/db/knowledge";
import { DISPATCH } from "./dispatch-config";
import { detectPop } from "./pop-detect";

const BOOKING_MATCH_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

export type BridgeOutcome = {
	processed: number;
	pops: number;
	failed: number;
};

export async function drainMemoryBridge(): Promise<BridgeOutcome> {
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
		await db.businessEventOutbox.update({
			where: { id: row.id },
			data: { status: "SENDING", attemptCount: { increment: 1 } },
		});

		try {
			const pop = await processEvent(row.businessEvent);

			await db.businessEventOutbox.update({
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

			await db.businessEventOutbox.update({
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

async function processEvent(event: {
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
}): Promise<boolean> {
	if (event.type !== "communication.received" || !event.message) {
		return false;
	}

	const detection = detectPop(event.message.subject, event.message.body);
	if (!detection) return false;

	const booking = await matchBooking(event.contactId, event.companyId);

	await db.businessEvent.upsert({
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
					paymentConfirmed: false,
					bookingId: booking?.id ?? null,
				},
			},
		});
	}

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
	const base = `Thank you — we have received your proof of payment${amountText}. We will confirm once it reflects on our bank statement.`;

	const tone = style[0]?.subject;
	return tone ? `${base}\n\n(Style note: ${tone})` : base;
}
