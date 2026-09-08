import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { WhatsappWebhookPayload } from "@crm/validation/whatsapp";
import { WhatsappService } from "../src/whatsapp/whatsapp.service";

const suffix = process.env.TEST_RUN_ID ?? "whatsapp-spec";

const service = new WhatsappService(db);

function payload(
	wamid: string,
	options: { from: string; name?: string; body?: string; type?: string },
): WhatsappWebhookPayload {
	return {
		object: "whatsapp_business_account",
		entry: [
			{
				id: "waba-1",
				changes: [
					{
						field: "messages",
						value: {
							metadata: {
								display_phone_number: "2711000111",
								phone_number_id: "pn-1",
							},
							contacts: options.name
								? [{ profile: { name: options.name }, wa_id: options.from }]
								: undefined,
							messages: [
								{
									from: options.from,
									id: wamid,
									timestamp: "1789000000",
									type: options.type ?? "text",
									text: { body: options.body ?? "hello" },
								},
							],
						},
					},
				],
			},
		],
	};
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { startsWith: "communication:whatsapp:wamid-" } },
	});
	await db.conversation.deleteMany({
		where: { externalThreadId: { startsWith: "2782" } },
	});
	await db.contact.deleteMany({ where: { email: { contains: suffix } } });
	await db.company.deleteMany({ where: { name: { contains: suffix } } });
}

afterAll(clean);

describe("WhatsApp ingress", () => {
	it("persists an inbound message with its raw payload and emits an event", async () => {
		const outcome = await service.ingest(
			payload("wamid-first", {
				from: "27821234567",
				name: "Lerato Moyo",
				body: "Hi, do you deliver to Sandton?",
			}),
		);

		expect(outcome.messages).toBe(1);
		expect(outcome.events).toBe(1);

		const conversation = await db.conversation.findFirst({
			where: { externalThreadId: "27821234567" },
			include: { messages: true },
		});
		expect(conversation).not.toBeNull();
		expect(conversation?.channel).toBe("WHATSAPP");
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]?.body).toBe(
			"Hi, do you deliver to Sandton?",
		);

		const metadata = conversation?.messages[0]?.metadata as {
			raw: { id: string };
			phoneNumberId: string;
		};
		expect(metadata.raw.id).toBe("wamid-first");
		expect(metadata.phoneNumberId).toBe("pn-1");

		const event = await db.businessEvent.findFirst({
			where: { idempotencyKey: "communication:whatsapp:wamid-first" },
			include: { outbox: true },
		});
		expect(event?.type).toBe("communication.received");
		expect(event?.source).toBe("WHATSAPP");
		expect(event?.channel).toBe("WHATSAPP");
		expect(event?.outbox[0]?.destination).toBe("memory-bridge");
	});

	it("matches a known contact by phone without guessing", async () => {
		const company = await db.company.create({
			data: { name: `WA Co ${suffix}`, updatedAt: new Date() },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Lerato",
				lastName: "Moyo",
				email: `wa-${suffix}@example.test`,
				phone: "+27 82 123 4567",
				companyId: company.id,
				updatedAt: new Date(),
			},
		});

		await service.ingest(
			payload("wamid-matched", { from: "27821234567", body: "It is me" }),
		);

		const conversation = await db.conversation.findFirst({
			where: { externalThreadId: "27821234567" },
		});
		expect(conversation?.contactId).toBe(contact.id);
		expect(conversation?.companyId).toBe(company.id);
	});

	it("leaves an unknown phone unlinked", async () => {
		await service.ingest(
			payload("wamid-stranger", { from: "27830000001", body: "Who is this?" }),
		);

		const conversation = await db.conversation.findFirst({
			where: { externalThreadId: "27830000001" },
		});
		expect(conversation).not.toBeNull();
		expect(conversation?.contactId).toBeNull();
	});

	it("is idempotent on webhook redelivery", async () => {
		const body = payload("wamid-dupe", {
			from: "27830000002",
			body: "same message",
		});

		await service.ingest(body);
		const again = await service.ingest(body);

		expect(again.events).toBe(0);

		const count = await db.communicationMessage.count({
			where: { providerMessageId: "wamid-dupe" },
		});
		expect(count).toBe(1);
	});

	it("applies delivery status updates", async () => {
		await service.ingest(
			payload("wamid-status", { from: "27830000003", body: "track me" }),
		);

		await service.ingest({
			object: "whatsapp_business_account",
			entry: [
				{
					id: "waba-1",
					changes: [
						{
							field: "messages",
							value: {
								statuses: [
									{
										id: "wamid-status",
										status: "delivered",
										timestamp: "1789000100",
										recipient_id: "27830000003",
									},
								],
							},
						},
					],
				},
			],
		});

		const message = await db.communicationMessage.findFirst({
			where: { providerMessageId: "wamid-status" },
		});
		const metadata = message?.metadata as { deliveryStatus: string };
		expect(metadata.deliveryStatus).toBe("delivered");
	});

	it("keeps media metadata without downloading content", async () => {
		const mediaPayload: WhatsappWebhookPayload = {
			entry: [
				{
					id: "waba-1",
					changes: [
						{
							field: "messages",
							value: {
								messages: [
									{
										from: "27830000004",
										id: "wamid-media",
										timestamp: "1789000000",
										type: "document",
										document: {
											id: "media-1",
											mime_type: "application/pdf",
											filename: "quote.pdf",
										},
									},
								],
							},
						},
					],
				},
			],
		};

		await service.ingest(mediaPayload);

		const message = await db.communicationMessage.findFirst({
			where: { providerMessageId: "wamid-media" },
		});
		const metadata = message?.metadata as {
			media: { id: string; mimeType: string; filename: string };
		};
		expect(metadata.media.id).toBe("media-1");
		expect(metadata.media.mimeType).toBe("application/pdf");
		expect(metadata.media.filename).toBe("quote.pdf");
	});
});
