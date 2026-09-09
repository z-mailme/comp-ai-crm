import { afterAll, describe, expect, it } from "bun:test";
import {
	BusinessEventSource,
	CommunicationChannel,
	CommunicationDirection,
	db,
} from "@crm/db";
import { BriefService } from "../src/business-os/brief.service";

const suffix = process.env.TEST_RUN_ID ?? "brief-spec";

const service = new BriefService(db);

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { startsWith: `brief:${suffix}` } },
	});
	await db.conversation.deleteMany({
		where: { subject: { contains: suffix } },
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

describe("BriefService", () => {
	it("surfaces a stale quote and an unanswered conversation", async () => {
		const marker = `${suffix}-main`;
		const user = await db.user.create({
			data: {
				id: `user-${marker}`,
				name: "Rep",
				email: `rep-${marker}@example.test`,
			},
		});
		const company = await db.company.create({
			data: { name: `Brief Co ${marker}`, updatedAt: new Date() },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Quiet",
				lastName: "Lead",
				email: `quiet-${marker}@example.test`,
				companyId: company.id,
				ownerId: user.id,
				updatedAt: new Date(),
			},
		});

		const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000);

		await db.deal.create({
			data: {
				name: `Quote ${marker}`,
				companyId: company.id,
				ownerId: user.id,
				stage: "CONTRACT_SENT",
				lastActivityAt: fourDaysAgo,
				updatedAt: new Date(),
			},
		});

		const conversation = await db.conversation.create({
			data: {
				channel: CommunicationChannel.EMAIL,
				subject: `Unanswered ${marker}`,
				contactId: contact.id,
				companyId: company.id,
				unreadCount: 1,
				firstMessageAt: fourDaysAgo,
				lastMessageAt: fourDaysAgo,
			},
		});
		await db.communicationMessage.create({
			data: {
				conversationId: conversation.id,
				channel: CommunicationChannel.EMAIL,
				direction: CommunicationDirection.INBOUND,
				sender: { email: contact.email },
				recipients: [],
				sentAt: fourDaysAgo,
			},
		});

		await db.businessEvent.create({
			data: {
				type: "POP_RECEIVED",
				source: BusinessEventSource.AGENT,
				contactId: contact.id,
				companyId: company.id,
				occurredAt: new Date(),
				data: { amount: 8000, paymentConfirmed: false },
				idempotencyKey: `brief:${suffix}:pop`,
			},
		});

		const brief = await service.daily();
		expect(brief.popReceived).toBeGreaterThanOrEqual(1);
		expect(brief.quotesToFollowUp).toBeGreaterThanOrEqual(1);

		const { exceptions } = await service.exceptions();
		const types = exceptions.map((exception) => exception.type);

		expect(types).toContain("STALE_QUOTE");
		expect(types).toContain("UNANSWERED_LEAD");
		expect(types).toContain("POP_RECEIVED");

		const urgent = exceptions.filter(
			(exception) => exception.severity === "URGENT",
		);
		const attention = exceptions.filter(
			(exception) => exception.severity === "ATTENTION",
		);
		expect(exceptions[0]?.severity).toBe(
			urgent.length > 0 ? "URGENT" : "ATTENTION",
		);
		expect(urgent.length + attention.length).toBe(exceptions.length);

		const pop = exceptions.find(
			(exception) => exception.type === "POP_RECEIVED",
		);
		expect(pop?.suggestedAction).toBe("Review POP");
	});
});
