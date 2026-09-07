import { afterAll, describe, expect, it } from "bun:test";
import { lockIdempotencyKey } from "@crm/db/idempotency";

const itWithDb = process.env.DATABASE_URL ? it : it.skip;

describe("gmail send idempotency lock", () => {
	itWithDb(
		"a second sender with the same key waits and sees the first write",
		async () => {
			const { db, EmailDirection } = await import("@crm/db");
			const suffix = `lock-${Date.now()}`;
			const userId = `user-${suffix}`;
			const rootId = `<root-${suffix}@mail.test>`;
			const messageId = `msg-${suffix}@mail.test`;
			const lockKey = `gmail-send:${userId}:${suffix}`;

			await db.user.create({
				data: { id: userId, name: "Lock Rep", email: `${suffix}@ex.test` },
			});
			const thread = await db.emailThread.create({
				data: {
					rootMessageId: rootId,
					subject: "Lock",
					matchStatus: "UNMATCHED",
					firstMessageAt: new Date("2026-09-05T10:00:00.000Z"),
					lastMessageAt: new Date("2026-09-05T10:00:00.000Z"),
					messageCount: 0,
				},
				select: { id: true },
			});

			try {
				const first = db.$transaction(async (tx) => {
					await lockIdempotencyKey(tx, lockKey);
					const existing = await tx.emailMessage.findUnique({
						where: { rfcMessageId: messageId },
						select: { id: true },
					});
					if (existing) return "duplicate";
					await tx.emailMessage.create({
						data: {
							threadId: thread.id,
							rfcMessageId: messageId,
							syncedByUserId: userId,
							direction: EmailDirection.OUTBOUND,
							fromEmail: "rep@example.test",
							recipients: [],
							sentAt: new Date("2026-09-05T10:00:00.000Z"),
						},
						select: { id: true },
					});
					await new Promise((resolve) => setTimeout(resolve, 400));
					return "sent";
				});

				await new Promise((resolve) => setTimeout(resolve, 50));

				const second = db.$transaction(async (tx) => {
					await lockIdempotencyKey(tx, lockKey);
					const existing = await tx.emailMessage.findUnique({
						where: { rfcMessageId: messageId },
						select: { id: true },
					});
					return existing ? "duplicate" : "sent";
				});

				const [firstResult, secondResult] = await Promise.all([first, second]);

				expect(firstResult).toBe("sent");
				expect(secondResult).toBe("duplicate");

				const rows = await db.emailMessage.count({
					where: { rfcMessageId: messageId },
				});
				expect(rows).toBe(1);
			} finally {
				await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
				await db.user.deleteMany({ where: { id: userId } });
			}
		},
	);
});

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
