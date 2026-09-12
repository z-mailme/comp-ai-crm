import { afterAll, describe, expect, it } from "bun:test";
import {
	BusinessEventSource,
	CommunicationChannel,
	CommunicationDirection,
	db,
} from "@crm/db";
import { recordKnowledge } from "@crm/db/knowledge";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	drainMemoryBridge,
	sendAcknowledgementViaApi,
} from "../agent/lib/event-bridge";
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
	await db.appSetting.updateMany({
		where: { id: SETTINGS_ID },
		data: { popAutoAcknowledge: false },
	});
	await db.businessKnowledge.deleteMany({
		where: { subject: { contains: suffix } },
	});
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { contains: suffix } },
	});
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { startsWith: `pop-ack-sent:${suffix}` } },
	});
	await db.businessEvent.deleteMany({
		where: { contact: { email: { contains: suffix } } },
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

	it("reads an amount written at the end of a sentence", () => {
		const found = detectPop(
			"POP attached",
			"Proof of payment — R8,000. Reference: INV-9",
		);

		expect(found).not.toBeNull();
		expect(found?.amount).toBe(8000);
		expect(found?.reference).toBe("INV-9");
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
			where: {
				contactId: contact.id,
				meta: { path: ["source"], equals: "pop-bridge" },
			},
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

async function setPolicy(enabled: boolean): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, popAutoAcknowledge: enabled },
		update: { popAutoAcknowledge: enabled },
	});
}

describe("safe-auto acknowledgement", () => {
	it("sends exactly once through the injected sender when the policy is on", async () => {
		await setPolicy(true);

		const { event } = await seedIncoming("auto-ack", {
			subject: "RE: Invoice INV-2026-055",
			body: "Proof of payment — R8,000 paid this morning. Reference: INV-2026-055",
			withBooking: true,
		});

		const sent: string[] = [];
		const fakeSend = async (eventId: string): Promise<string> => {
			sent.push(eventId);
			await db.businessEvent.create({
				data: {
					type: "pop.acknowledgement.sent",
					source: BusinessEventSource.AGENT,
					occurredAt: new Date(),
					correlationId: eventId,
					data: { idempotencyKey: `pop-ack-${eventId}` },
					idempotencyKey: `pop-ack-sent:${suffix}:${eventId}`,
				},
			});
			return "sent";
		};

		await drainMemoryBridge({ send: fakeSend });

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pop).not.toBeNull();
		expect(sent).toEqual([pop?.id]);

		const data = pop?.data as { acknowledgementApproved?: boolean };
		expect(data.acknowledgementApproved).toBe(true);

		const confirmed = await db.businessEvent.findFirst({
			where: { type: "PAYMENT_CONFIRMED", correlationId: event.id },
		});
		expect(confirmed).toBeNull();

		await db.businessEventOutbox.updateMany({
			where: { businessEventId: event.id },
			data: { status: "PENDING", nextAttemptAt: null },
		});

		await drainMemoryBridge({ send: fakeSend });
		expect(sent).toHaveLength(1);

		const audits = await db.businessEvent.count({
			where: {
				type: "pop.acknowledgement.sent",
				correlationId: pop?.id ?? "",
			},
		});
		expect(audits).toBe(1);
	});

	it("retries a failed send and delivers exactly once", async () => {
		await setPolicy(true);

		const { event } = await seedIncoming("retry", {
			subject: "POP attached",
			body: "Proof of payment — R5,600 paid today. Reference: INV-88",
		});

		let attempts = 0;
		const fakeSend = async (eventId: string): Promise<string> => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("timeout talking to the API");
			}
			await db.businessEvent.create({
				data: {
					type: "pop.acknowledgement.sent",
					source: BusinessEventSource.AGENT,
					occurredAt: new Date(),
					correlationId: eventId,
					data: { idempotencyKey: `pop-ack-${eventId}` },
					idempotencyKey: `pop-ack-sent:${suffix}:${eventId}`,
				},
			});
			return "sent";
		};

		await drainMemoryBridge({ send: fakeSend });
		expect(attempts).toBe(1);

		const afterFailure = await db.businessEventOutbox.findFirst({
			where: { businessEventId: event.id },
		});
		expect(afterFailure?.status).not.toBe("SENT");

		await db.businessEventOutbox.updateMany({
			where: { businessEventId: event.id },
			data: { status: "PENDING", nextAttemptAt: null },
		});

		await drainMemoryBridge({ send: fakeSend });
		expect(attempts).toBe(2);

		const afterRetry = await db.businessEventOutbox.findFirst({
			where: { businessEventId: event.id },
		});
		expect(afterRetry?.status).toBe("SENT");

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		const audits = await db.businessEvent.count({
			where: {
				type: "pop.acknowledgement.sent",
				correlationId: pop?.id ?? "",
			},
		});
		expect(audits).toBe(1);

		const confirmed = await db.businessEvent.findFirst({
			where: { type: "PAYMENT_CONFIRMED", correlationId: event.id },
		});
		expect(confirmed).toBeNull();
	});

	it("does not send when the message carries a dispute signal", async () => {
		await setPolicy(true);

		const { event } = await seedIncoming("dispute", {
			subject: "I want a refund",
			body: "I want a refund. Proof of payment — R8,000 paid this morning. Reference: INV-9",
		});

		const sent: string[] = [];
		await drainMemoryBridge({
			send: async (eventId: string) => {
				sent.push(eventId);
				return "sent";
			},
		});

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pop).not.toBeNull();
		expect(sent).toHaveLength(0);

		const data = pop?.data as { acknowledgementApproved?: boolean };
		expect(data.acknowledgementApproved ?? false).toBe(false);
	});

	it("stays a draft when the policy flag is off", async () => {
		await setPolicy(false);

		const { event } = await seedIncoming("policy-off", {
			subject: "POP attached",
			body: "Proof of payment — R3,400 paid in full. Reference: INV-22",
		});

		const sent: string[] = [];
		await drainMemoryBridge({
			send: async (eventId: string) => {
				sent.push(eventId);
				return "sent";
			},
		});

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		expect(pop).not.toBeNull();
		expect(sent).toHaveLength(0);
	});
});

describe("business brain to agent acknowledgement", () => {
	it("lets recorded style shape the wording without leaking internals", async () => {
		await setPolicy(false);

		const { event, contact } = await seedIncoming("brain", {
			subject: "POP attached",
			body: "Proof of payment — R4,200 paid in full. Reference: INV-77",
		});

		await recordKnowledge(db, {
			kind: "COMMUNICATION_STYLE",
			subject: `formal and brief ${suffix}`,
			detail: "The client prefers short formal replies.",
			sourceType: BusinessEventSource.CRM,
			contactId: contact.id,
			humanConfirmed: true,
		});

		await drainMemoryBridge({ send: async () => "skipped" });

		const pop = await db.businessEvent.findFirst({
			where: { type: "POP_RECEIVED", correlationId: event.id },
		});
		const data = pop?.data as { suggestedAcknowledgement?: string };

		expect(data.suggestedAcknowledgement).toBe(
			"Thank you. We have received your proof of payment of R4,200. We will confirm once it reflects on our bank statement.",
		);
		expect(data.suggestedAcknowledgement).not.toContain("Style note");
		expect(data.suggestedAcknowledgement).not.toContain(suffix);
		expect(data.suggestedAcknowledgement).not.toContain("formal");
	});
});

describe("sendAcknowledgementViaApi", () => {
	async function withServer(
		handler: () => Response,
		run: () => Promise<void>,
	): Promise<void> {
		const server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: handler,
		});
		const previousUrl = process.env.API_URL;
		const previousSecret = process.env.AGENT_BRIDGE_SECRET;
		process.env.API_URL = `http://127.0.0.1:${server.port}`;
		process.env.AGENT_BRIDGE_SECRET = "bridge-test-secret";
		try {
			await run();
		} finally {
			server.stop(true);
			if (previousUrl === undefined) delete process.env.API_URL;
			else process.env.API_URL = previousUrl;
			if (previousSecret === undefined) delete process.env.AGENT_BRIDGE_SECRET;
			else process.env.AGENT_BRIDGE_SECRET = previousSecret;
		}
	}

	it("accepts sent and already-sent as terminal success", async () => {
		await withServer(
			() => Response.json({ status: "already-sent", reason: null }),
			async () => {
				await expect(sendAcknowledgementViaApi("evt-1")).resolves.toBe(
					"already-sent",
				);
			},
		);
	});

	it("rejects a 200 whose body says failed", async () => {
		await withServer(
			() => Response.json({ status: "failed", reason: "no Gmail account" }),
			async () => {
				await expect(sendAcknowledgementViaApi("evt-2")).rejects.toThrow(
					"failed",
				);
			},
		);
	});

	it("rejects a 200 whose body says skipped", async () => {
		await withServer(
			() => Response.json({ status: "skipped", reason: "policy off" }),
			async () => {
				await expect(sendAcknowledgementViaApi("evt-3")).rejects.toThrow(
					"skipped",
				);
			},
		);
	});

	it("rejects a server error", async () => {
		await withServer(
			() => new Response("boom", { status: 500 }),
			async () => {
				await expect(sendAcknowledgementViaApi("evt-4")).rejects.toThrow(
					"HTTP 500",
				);
			},
		);
	});
});
