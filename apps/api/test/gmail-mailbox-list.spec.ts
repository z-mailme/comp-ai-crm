import { afterAll, describe, expect, it } from "bun:test";
import { db, EmailDirection, MailboxMatchStatus } from "@crm/db";
import { MailboxListService } from "../src/google/mailbox-list.service";

const suffix = process.env.TEST_RUN_ID ?? "mailbox-list-spec";

const service = new MailboxListService(db);

type Seed = {
	userId: string;
	threadId: string;
};

async function seed(
	name: string,
	messages: {
		gmailThreadId: string;
		rfc: string;
		subject: string;
		labelIds: string[];
		sentAt: Date;
		fromEmail?: string;
	}[],
): Promise<Seed> {
	const marker = `${suffix}-${name}`;
	const userId = `user-${marker}`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `rep-${marker}@example.test` },
	});

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${marker}`,
			subject: messages[0]?.subject ?? null,
			matchStatus: MailboxMatchStatus.UNMATCHED,
			firstMessageAt: messages[0]?.sentAt ?? new Date(),
			lastMessageAt: messages.at(-1)?.sentAt ?? new Date(),
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
				gmailThreadId: message.gmailThreadId,
				labelIds: message.labelIds,
				direction: EmailDirection.INBOUND,
				fromEmail: message.fromEmail ?? "customer@example.test",
				fromName: "Customer",
				recipients: [],
				subject: message.subject,
				snippet: `snippet for ${message.subject}`,
				sentAt: message.sentAt,
			},
		});
	}

	return { userId, threadId: thread.id };
}

async function clean(): Promise<void> {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: suffix } },
	});
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
}

afterAll(clean);

const at = (minute: number) => new Date(Date.UTC(2025, 0, 1, 10, minute));

describe("MailboxListService", () => {
	it("groups messages by gmailThreadId and reads view labels", async () => {
		const { userId } = await seed("views", [
			{
				gmailThreadId: "gt-inbox",
				rfc: "views-1",
				subject: "Inbox one",
				labelIds: ["INBOX", "UNREAD"],
				sentAt: at(1),
			},
			{
				gmailThreadId: "gt-sent",
				rfc: "views-2",
				subject: "Sent one",
				labelIds: ["SENT"],
				sentAt: at(2),
			},
			{
				gmailThreadId: "gt-spam",
				rfc: "views-3",
				subject: "Spam one",
				labelIds: ["SPAM"],
				sentAt: at(3),
			},
		]);

		const inbox = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(inbox.rows.map((row) => row.providerThreadId)).toEqual(["gt-inbox"]);
		expect(inbox.rows[0]?.unread).toBe(true);

		const sent = await service.threads(userId, {
			view: "sent",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(sent.rows.map((row) => row.providerThreadId)).toEqual(["gt-sent"]);

		const all = await service.threads(userId, {
			view: "all",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(all.rows.map((row) => row.providerThreadId).sort()).toEqual([
			"gt-inbox",
			"gt-sent",
		]);

		const spam = await service.threads(userId, {
			view: "spam",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(spam.rows.map((row) => row.providerThreadId)).toEqual(["gt-spam"]);
	});

	it("merges two email threads that share one gmailThreadId", async () => {
		const { userId } = await seed("merge", [
			{
				gmailThreadId: "gt-shared",
				rfc: "merge-1",
				subject: "First half",
				labelIds: ["INBOX"],
				sentAt: at(1),
			},
			{
				gmailThreadId: "gt-shared",
				rfc: "merge-2",
				subject: "Second half",
				labelIds: ["INBOX", "Label_7"],
				sentAt: at(2),
			},
		]);

		await db.emailMessage.update({
			where: { rfcMessageId: "merge-2" },
			data: {
				thread: {
					create: {
						rootMessageId: `root-${suffix}-merge-second`,
						subject: "Second half",
						matchStatus: MailboxMatchStatus.UNMATCHED,
						firstMessageAt: at(2),
						lastMessageAt: at(2),
						messageCount: 1,
					},
				},
			},
		});

		const inbox = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});

		expect(inbox.rows).toHaveLength(1);
		expect(inbox.rows[0]?.messageCount).toBe(2);
		expect(inbox.rows[0]?.subject).toBe("Second half");
		expect(inbox.rows[0]?.userLabelIds).toEqual(["Label_7"]);
	});

	it("filters unread, starred, and search text", async () => {
		const { userId } = await seed("filters", [
			{
				gmailThreadId: "gt-unread",
				rfc: "filters-1",
				subject: "Unread pricing",
				labelIds: ["INBOX", "UNREAD"],
				sentAt: at(1),
			},
			{
				gmailThreadId: "gt-starred",
				rfc: "filters-2",
				subject: "Starred invoice",
				labelIds: ["INBOX", "STARRED"],
				sentAt: at(2),
			},
		]);

		const unread = await service.threads(userId, {
			view: "inbox",
			unreadOnly: true,
			starredOnly: false,
			limit: 50,
		});
		expect(unread.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-unread",
		]);

		const starred = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: true,
			limit: 50,
		});
		expect(starred.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-starred",
		]);

		const found = await service.threads(userId, {
			view: "inbox",
			q: "invoice",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(found.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-starred",
		]);
	});

	it("paginates with a stable cursor", async () => {
		const { userId } = await seed(
			"pages",
			[1, 2, 3, 4, 5].map((minute) => ({
				gmailThreadId: `gt-page-${minute}`,
				rfc: `pages-${minute}`,
				subject: `Page ${minute}`,
				labelIds: ["INBOX"],
				sentAt: at(minute),
			})),
		);

		const first = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 2,
		});
		expect(first.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-page-5",
			"gt-page-4",
		]);
		expect(first.nextCursor).not.toBeNull();

		const second = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 2,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-page-3",
			"gt-page-2",
		]);

		const third = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 2,
			cursor: second.nextCursor ?? undefined,
		});
		expect(third.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-page-1",
		]);
		expect(third.nextCursor).toBeNull();
	});

	it("hides a thread whose messages were all deleted", async () => {
		const { userId, threadId } = await seed("ghost", [
			{
				gmailThreadId: "gt-ghost",
				rfc: "ghost-1",
				subject: "Ghost",
				labelIds: ["INBOX"],
				sentAt: at(1),
			},
		]);

		await db.emailMessage.deleteMany({ where: { threadId } });

		const inbox = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(inbox.rows).toHaveLength(0);

		const thread = await db.emailThread.findUnique({
			where: { id: threadId },
			select: { id: true },
		});
		expect(thread).not.toBeNull();
	});

	it("keeps unmatched email visible and attaches CRM names when linked", async () => {
		const { userId, threadId } = await seed("linked", [
			{
				gmailThreadId: "gt-linked",
				rfc: "linked-1",
				subject: "Linked",
				labelIds: ["INBOX"],
				sentAt: at(1),
			},
		]);

		const company = await db.company.create({
			data: { name: `Linked Co ${suffix}`, domain: null },
			select: { id: true, name: true },
		});
		await db.emailThread.update({
			where: { id: threadId },
			data: {
				companyId: company.id,
				matchStatus: MailboxMatchStatus.MATCHED_COMPANY,
			},
		});

		const inbox = await service.threads(userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(inbox.rows).toHaveLength(1);
		expect(inbox.rows[0]?.match?.companyName).toBe(company.name);

		await db.company.deleteMany({ where: { id: company.id } });
	});
});
