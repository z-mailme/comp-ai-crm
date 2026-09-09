import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { BusinessEventSource, CommunicationChannel, db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import type { GmailSendService } from "../src/google/gmail-send.service";
import { PopAcknowledgementService } from "../src/google/pop-acknowledgement.service";

const suffix = process.env.TEST_RUN_ID ?? "pop-ack-spec";

const sentCalls: { userId: string; key: string; body: string }[] = [];

const gmailSend = {
	send: async (
		userId: string,
		input: { idempotencyKey: string; body: string },
	) => {
		sentCalls.push({ userId, key: input.idempotencyKey, body: input.body });
		return {
			status: "sent" as const,
			reason: null,
			gmailMessageId: `g-${suffix}`,
			duplicate: false,
		};
	},
} as unknown as GmailSendService;

const service = new PopAcknowledgementService(db, gmailSend);

const seededEventIds: string[] = [];

beforeEach(() => {
	sentCalls.length = 0;
});

async function setPolicy(enabled: boolean): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, popAutoAcknowledge: enabled },
		update: { popAutoAcknowledge: enabled },
	});
}

async function seedPop(
	name: string,
	options: { approved: boolean; withAccount?: boolean },
) {
	const marker = `${suffix}-${name}`;
	const user = await db.user.create({
		data: { id: `user-${marker}`, name: "Rep", email: `rep-${marker}@ex.test` },
	});

	const channelAccount = options.withAccount
		? await db.channelAccount.create({
				data: {
					channel: CommunicationChannel.EMAIL,
					provider: "gmail",
					label: `Mailbox ${marker}`,
					userId: user.id,
				},
			})
		: null;

	const conversation = await db.conversation.create({
		data: {
			channel: CommunicationChannel.EMAIL,
			channelAccountId: channelAccount?.id ?? null,
			firstMessageAt: new Date(),
			lastMessageAt: new Date(),
		},
	});

	const event = await db.businessEvent.create({
		data: {
			type: "POP_RECEIVED",
			source: BusinessEventSource.AGENT,
			conversationId: conversation.id,
			occurredAt: new Date(),
			data: {
				amount: 8000,
				currency: "ZAR",
				reference: `INV-${marker}`,
				paymentConfirmed: false,
				acknowledgementApproved: options.approved,
				suggestedAcknowledgement:
					"Thank you — we have received your proof of payment.",
			},
			idempotencyKey: `pop-ack:${marker}`,
		},
	});
	seededEventIds.push(event.id);

	return { user, event };
}

async function clean(): Promise<void> {
	await setPolicy(false);
	await db.businessEvent.deleteMany({
		where: {
			type: "pop.acknowledgement.sent",
			correlationId: { in: seededEventIds },
		},
	});
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { startsWith: `pop-ack:${suffix}` } },
	});
	await db.conversation.deleteMany({
		where: { channelAccount: { label: { contains: suffix } } },
	});
	await db.channelAccount.deleteMany({
		where: { label: { contains: suffix } },
	});
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
}

afterAll(clean);

describe("PopAcknowledgementService", () => {
	it("sends through the Gmail path and writes the audit event once", async () => {
		await setPolicy(true);
		const { user, event } = await seedPop("send", {
			approved: true,
			withAccount: true,
		});

		const first = await service.send(event.id);

		expect(first.status).toBe("sent");
		expect(sentCalls).toHaveLength(1);
		expect(sentCalls[0]?.userId).toBe(user.id);
		expect(sentCalls[0]?.key).toBe(`pop-ack-${event.id}`);
		expect(sentCalls[0]?.body).toContain("proof of payment");

		const audit = await db.businessEvent.findFirst({
			where: { type: "pop.acknowledgement.sent", correlationId: event.id },
		});
		expect(audit).not.toBeNull();

		const data = audit?.data as {
			agent: string;
			autonomy: string;
			idempotencyKey: string;
			paymentConfirmed: boolean;
		};
		expect(data.agent).toBe("pop-bridge");
		expect(data.autonomy).toBe("SAFE_AUTO");
		expect(data.idempotencyKey).toBe(`pop-ack-${event.id}`);
		expect(data.paymentConfirmed).toBe(false);

		const second = await service.send(event.id);
		expect(second.status).toBe("already-sent");
		expect(sentCalls).toHaveLength(1);
	});

	it("skips when the workspace policy is off", async () => {
		await setPolicy(false);
		const { event } = await seedPop("off", { approved: true });

		const outcome = await service.send(event.id);

		expect(outcome.status).toBe("skipped");
		expect(sentCalls).toHaveLength(0);
	});

	it("skips when the safe-auto gate never approved the event", async () => {
		await setPolicy(true);
		const { event } = await seedPop("unapproved", { approved: false });

		const outcome = await service.send(event.id);

		expect(outcome.status).toBe("skipped");
		expect(sentCalls).toHaveLength(0);
	});

	it("skips when the conversation has no synced Gmail account", async () => {
		await setPolicy(true);
		const { event } = await seedPop("no-account", {
			approved: true,
			withAccount: false,
		});

		const outcome = await service.send(event.id);

		expect(outcome.status).toBe("skipped");
		expect(sentCalls).toHaveLength(0);
	});
});
