import { afterAll, describe, expect, it } from "bun:test";
import {
	BusinessEventSource,
	CommunicationChannel,
	CommunicationDirection,
	db,
} from "@crm/db";
import { drainMemoryBridge } from "../agent/lib/event-bridge";
import { detectPop } from "../agent/lib/pop-detect";

const suffix = process.env.TEST_RUN_ID ?? "event-bridge-spec";

async function seedIncoming(
	name: string,
	options: { subject: string; body: string; withBooking?: boolean },
) {
	const marker = `${suffix}-${name}`;
	const userId = `user-${marker}`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `rep-${marker}@example.test` },
	});

	const company = await db.company.create({
		data: { name: `Bridge Co ${marker}`, updatedAt: new Date() },
	});
	const contact = await db.contact.create({
		data: {
			firstName: "Customer",
			lastName: "Person",
			email: `customer-${marker}@example.test`,
			companyId: company.id,
			updatedAt: new Date(),
		},
	});

	let bookingId: string | null = null;
	if (options.withBooking) {
		const deal = await db.deal.create({
			data: {
				name: `Deal ${marker}`,
				companyId: company.id,
				ownerId: userId,
				stage: "QUALIFIED_TO_BUY",
				updatedAt: new Date(),
			},
		});
		const booking = await db.booking.create({
			data: {
				dealId: deal.id,
				eventDate: new Date(Date.now() + 14 * 86_400_000),
				status: "CONFIRMED",
			},
		});
		bookingId = booking.id;
	}

	const conversation = await db.conversation.create({
		data: {
			channel: CommunicationChannel.EMAIL,
			companyId: company.id,
			contactId: contact.id,
			firstMessageAt: new Date(),
			lastMessageAt: new Date(),
		},
	});

	const message = await db.communicationMessage.create({
		data: {
			conversationId: conversation.id,
			channel: CommunicationChannel.EMAIL,
			direction: CommunicationDirection.INBOUND,
			sender: { email: contact.email, name: "Customer Person" },
			recipients: [],
			subject: options.subject,
			body: options.body,
			sentAt: new Date(),
		},
	});

	const event = await db.businessEvent.create({
		data: {
			type: "communication.received",
			source: BusinessEventSource.GMAIL,
			companyId: company.id,
			contactId: contact.id,
			conversationId: conversation.id,
			messageId: message.id,
			occurredAt: new Date(),
			data: {},
			idempotencyKey: `test:${marker}`,
			outbox: {
				create: {
					destination: "memory-bridge",
					payload: { entityType: "MESSAGE", entityId: message.id },
				},
			},
		},
	});

	return { userId, company, contact, bookingId, event };
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { contains: suffix } },
	});
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { startsWith: "pop:test:" } },
	});
	await db.activity.deleteMany({
		where: { meta: { path: ["source"], equals: "pop-bridge" } },
	});
	await db.conversation.deleteMany({
		where: { contact: { email: { contains: suffix } } },
	});
	await db.booking.deleteMany({
		where: { deal: { name: { contains: suffix } } },
	});
	await db.deal.deleteMany({ where: { name: { contains: suffix } } });
	await db.contact.deleteMany({ where: { email: { contains: suffix } } });
	await db.company.deleteMany({ where: { name: { contains: suffix } } });
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
}

afterAll(clean);

describe("detectPop", () => {
	it("detects a proof of payment with amount and reference", () => {
		const found = detectPop(
			"POP attached",
			"Hi, please find the POP attached. R12,500 paid this morning. Reference: INV-2026-031",
		);

		expect(found).not.toBeNull();
		expect(found?.amount).toBe(12500);
		expect(found?.reference).toBe("INV-2026-031");
	});

	it("ignores ordinary mail", () => {
		expect(
			detectPop("Quote request", "Can you quote for 120 guests in December?"),
		).toBeNull();
	});
});

describe("drainMemoryBridge", () => {
	it("turns a POP email into a POP_RECEIVED event without confirming payment", async () => {
		const { event, contact, bookingId } = await seedIncoming("pop", {
			subject: "RE: Invoice INV-2026-031",
			body: "Please find the POP attached — R12,500 paid this morning. Reference: INV-2026-031",
			withBooking: true,
		});

		const outcome = await drainMemoryBridge();

		expect(outcome.pops).toBeGreaterThanOrEqual(1);

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pop).not.toBeNull();

		const data = pop?.data as {
			amount: number;
			reference: string;
			paymentConfirmed: boolean;
			suggestedAcknowledgement: string;
		};
		expect(data.amount).toBe(12500);
		expect(data.reference).toBe("INV-2026-031");
		expect(data.paymentConfirmed).toBe(false);
		expect(data.suggestedAcknowledgement).toContain("proof of payment");

		expect(pop?.contactId).toBe(contact.id);
		expect(pop?.bookingId).toBe(bookingId);

		const activity = await db.activity.findFirst({
			where: { meta: { path: ["source"], equals: "pop-bridge" } },
		});
		expect(activity?.subject).toContain("R12,500");

		const confirmed = await db.businessEvent.findFirst({
			where: { type: "PAYMENT_CONFIRMED", correlationId: event.id },
		});
		expect(confirmed).toBeNull();

		const outbox = await db.businessEventOutbox.findFirst({
			where: { businessEventId: event.id },
		});
		expect(outbox?.status).toBe("SENT");
	});

	it("ignores non-POP mail and still settles the outbox row", async () => {
		const { event } = await seedIncoming("plain", {
			subject: "Quote request: wedding",
			body: "Can you quote draping for 14 December?",
		});

		await drainMemoryBridge();

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pop).toBeNull();

		const outbox = await db.businessEventOutbox.findFirst({
			where: { businessEventId: event.id },
		});
		expect(outbox?.status).toBe("SENT");
	});

	it("is idempotent across repeated drains", async () => {
		const { event } = await seedIncoming("twice", {
			subject: "POP attached",
			body: "Proof of payment — R8,000. Reference: INV-1",
		});

		await drainMemoryBridge();
		await drainMemoryBridge();

		const pops = await db.businessEvent.count({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pops).toBe(1);
	});
});
