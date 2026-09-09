import { afterAll, describe, expect, it } from "bun:test";
import { GMAIL_MODIFY_SCOPE } from "@crm/auth";
import { db, EmailDirection, MailboxMatchStatus } from "@crm/db";
import type { GmailClient } from "../src/google/gmail.client";
import { GmailModifyService } from "../src/google/gmail-modify.service";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";

const suffix = process.env.TEST_RUN_ID ?? "gmail-modify-spec";

type BatchCall = {
	ids: string[];
	addLabelIds?: string[];
	removeLabelIds?: string[];
};

function kit(options: {
	scopes: Set<string>;
	batchOutcome?: "ok" | "rate-limited";
}) {
	const batchCalls: BatchCall[] = [];

	const gmail = {
		async batchModify(
			_accessToken: string,
			input: BatchCall,
		): Promise<MailboxResult<Record<string, never>>> {
			batchCalls.push(input);
			if (options.batchOutcome === "rate-limited") {
				return {
					outcome: "rate-limited",
					reason: "Quota exceeded.",
					retryAfterMs: 60_000,
				};
			}
			return { outcome: "ok", data: {} };
		},
	} as unknown as GmailClient;

	const tokens = {
		async grantedScopes(): Promise<Set<string>> {
			return options.scopes;
		},
		async accessTokenFor(): Promise<{
			outcome: "ok";
			accessToken: string;
		}> {
			return { outcome: "ok", accessToken: "token" };
		},
	} as unknown as MailboxTokenService;

	return { batchCalls, service: new GmailModifyService(db, gmail, tokens) };
}

async function seed(
	name: string,
	messages: { gt: string; rfc: string; labels: string[] }[],
): Promise<string> {
	const marker = `${suffix}-${name}`;
	const userId = `user-${marker}`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `rep-${marker}@example.test` },
	});

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${marker}`,
			subject: "Modify me",
			matchStatus: MailboxMatchStatus.UNMATCHED,
			firstMessageAt: new Date(),
			lastMessageAt: new Date(),
			messageCount: messages.length,
		},
	});

	for (const message of messages) {
		await db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: message.rfc,
				syncedByUserId: userId,
				gmailMessageId: `g-${message.rfc}`,
				gmailThreadId: message.gt,
				labelIds: message.labels,
				direction: EmailDirection.INBOUND,
				fromEmail: "customer@example.test",
				recipients: [],
				sentAt: new Date(),
			},
		});
	}

	return userId;
}

async function labelsOf(rfc: string): Promise<string[]> {
	const row = await db.emailMessage.findUnique({
		where: { rfcMessageId: rfc },
		select: { labelIds: true },
	});
	return row?.labelIds ?? [];
}

afterAll(async () => {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: suffix } },
	});
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
});

const WITH_MODIFY = new Set([GMAIL_MODIFY_SCOPE]);

describe("GmailModifyService", () => {
	it("requires the gmail.modify scope", async () => {
		const userId = await seed("scope", [
			{ gt: "gt-scope", rfc: "scope-1", labels: ["INBOX"] },
		]);
		const setup = kit({ scopes: new Set() });

		const outcome = await setup.service.act(userId, {
			action: "markRead",
			providerThreadIds: ["gt-scope"],
		});

		expect(outcome.status).toBe("scope-required");
		expect(setup.batchCalls).toHaveLength(0);
	});

	it("marks read: removes UNREAD in Gmail and in the mirror", async () => {
		const userId = await seed("read", [
			{ gt: "gt-read", rfc: "read-1", labels: ["INBOX", "UNREAD", "Label_7"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY });

		const outcome = await setup.service.act(userId, {
			action: "markRead",
			providerThreadIds: ["gt-read"],
		});

		expect(outcome.status).toBe("applied");
		expect(outcome.modified).toBe(1);
		expect(setup.batchCalls).toHaveLength(1);
		expect(setup.batchCalls[0]?.ids).toEqual(["g-read-1"]);
		expect(setup.batchCalls[0]?.removeLabelIds).toEqual(["UNREAD"]);
		expect(setup.batchCalls[0]?.addLabelIds).toEqual([]);

		const labels = await labelsOf("read-1");
		expect(labels).toContain("INBOX");
		expect(labels).toContain("Label_7");
		expect(labels).not.toContain("UNREAD");
	});

	it("stars without duplicating an existing star", async () => {
		const userId = await seed("star", [
			{ gt: "gt-star", rfc: "star-1", labels: ["INBOX", "STARRED"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY });

		await setup.service.act(userId, {
			action: "star",
			providerThreadIds: ["gt-star"],
		});

		expect(setup.batchCalls[0]?.addLabelIds).toEqual(["STARRED"]);
		expect(await labelsOf("star-1")).toEqual(["INBOX", "STARRED"]);
	});

	it("trashes and untrashes", async () => {
		const userId = await seed("trash", [
			{ gt: "gt-trash", rfc: "trash-1", labels: ["INBOX"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY });

		await setup.service.act(userId, {
			action: "trash",
			providerThreadIds: ["gt-trash"],
		});
		expect(await labelsOf("trash-1")).toEqual(["INBOX", "TRASH"]);

		await setup.service.act(userId, {
			action: "untrash",
			providerThreadIds: ["gt-trash"],
		});
		expect(await labelsOf("trash-1")).toEqual(["INBOX"]);
	});

	it("applies and removes a custom label", async () => {
		const userId = await seed("label", [
			{ gt: "gt-label", rfc: "label-1", labels: ["INBOX"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY });

		const applied = await setup.service.act(userId, {
			action: "applyLabel",
			providerThreadIds: ["gt-label"],
			labelId: "Label_99",
		});
		expect(applied.status).toBe("applied");
		expect((await labelsOf("label-1")).sort()).toEqual(["INBOX", "Label_99"]);

		await setup.service.act(userId, {
			action: "removeLabel",
			providerThreadIds: ["gt-label"],
			labelId: "Label_99",
		});
		expect(await labelsOf("label-1")).toEqual(["INBOX"]);

		const missing = await setup.service.act(userId, {
			action: "applyLabel",
			providerThreadIds: ["gt-label"],
		});
		expect(missing.status).toBe("failed");
	});

	it("acts on every message in every selected thread", async () => {
		const userId = await seed("multi", [
			{ gt: "gt-a", rfc: "multi-1", labels: ["INBOX"] },
			{ gt: "gt-a", rfc: "multi-2", labels: ["INBOX"] },
			{ gt: "gt-b", rfc: "multi-3", labels: ["INBOX"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY });

		const outcome = await setup.service.act(userId, {
			action: "archive",
			providerThreadIds: ["gt-a", "gt-b"],
		});

		expect(outcome.modified).toBe(3);
		expect(setup.batchCalls[0]?.ids.sort()).toEqual([
			"g-multi-1",
			"g-multi-2",
			"g-multi-3",
		]);
		expect(setup.batchCalls[0]?.removeLabelIds).toEqual(["INBOX"]);

		expect(await labelsOf("multi-1")).toEqual([]);
		expect(await labelsOf("multi-3")).toEqual([]);
	});

	it("reports rate limits without touching the mirror", async () => {
		const userId = await seed("quota", [
			{ gt: "gt-quota", rfc: "quota-1", labels: ["INBOX", "UNREAD"] },
		]);
		const setup = kit({ scopes: WITH_MODIFY, batchOutcome: "rate-limited" });

		const outcome = await setup.service.act(userId, {
			action: "markRead",
			providerThreadIds: ["gt-quota"],
		});

		expect(outcome.status).toBe("rate-limited");
		expect(await labelsOf("quota-1")).toEqual(["INBOX", "UNREAD"]);
	});
});
