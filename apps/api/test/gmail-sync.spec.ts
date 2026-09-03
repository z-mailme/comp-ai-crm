import { afterAll, describe, expect, it } from "bun:test";
import {
	db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import type {
	GmailClient,
	GmailMessage,
	HistoryList,
	MessageList,
	Profile,
} from "../src/google/gmail.client";
import type { GmailBackfillInput } from "../src/google/gmail-backfill";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { SyncSource } from "../src/mailbox/mailbox.constants";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

type Ok<T> = { outcome: "ok"; data: T };

type ListMessagesCall = Parameters<GmailClient["listMessages"]>[1];
type ListHistoryCall = Parameters<GmailClient["listHistory"]>[1];

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

const suffix = process.env.TEST_RUN_ID ?? "gmail-sync-spec";

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
} as unknown as AgentTriggerService;

class FakeGmail {
	readonly listMessageCalls: ListMessagesCall[] = [];
	readonly historyCalls: ListHistoryCall[] = [];
	readonly getMessageIds: string[] = [];
	readonly messages = new Map<string, GmailMessage>();
	private readonly listPages = new Map<string, MessageList>();
	private readonly historyPages = new Map<string, HistoryList>();
	private readonly profileData: Profile;

	constructor(mailbox: string) {
		this.profileData = { emailAddress: mailbox, historyId: "history-start" };
	}

	setListPage(pageToken: string | undefined, page: MessageList): void {
		this.listPages.set(pageToken ?? "", page);
	}

	setHistoryPage(pageToken: string | undefined, page: HistoryList): void {
		this.historyPages.set(pageToken ?? "", page);
	}

	async profile(): Promise<MailboxResult<Profile>> {
		return ok(this.profileData);
	}

	async listMessages(
		_accessToken: string,
		options: ListMessagesCall,
	): Promise<MailboxResult<MessageList>> {
		this.listMessageCalls.push(options);
		return ok(this.listPages.get(options.pageToken ?? "") ?? {});
	}

	async listHistory(
		_accessToken: string,
		options: ListHistoryCall,
	): Promise<MailboxResult<HistoryList>> {
		this.historyCalls.push(options);
		return ok(this.historyPages.get(options.pageToken ?? "") ?? {});
	}

	async getMessage(
		_accessToken: string,
		id: string,
	): Promise<MailboxResult<GmailMessage>> {
		this.getMessageIds.push(id);
		const message = this.messages.get(id);
		if (message) return ok(message);

		return {
			outcome: "failed",
			reason: `Missing test message ${id}.`,
			retryable: false,
		};
	}
}

type Kit = {
	marker: string;
	userId: string;
	mailbox: string;
	row: MailboxSync;
	gmail: FakeGmail;
	service: GmailSyncService;
};

async function kit(
	name: string,
	options: { autoCreate?: boolean; cursor?: string | null } = {},
): Promise<Kit> {
	const marker = `${suffix}-${name}`;
	await clean(marker);

	const userId = `user-${marker}`;
	const mailbox = `rep-${marker}@example.test`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});

	const cursor = "cursor" in options ? options.cursor : "cursor-start";
	const row = await db.mailboxSync.create({
		data: {
			userId,
			source: "gmail",
			status: GoogleSyncStatus.IDLE,
			cursor,
			autoCreate: options.autoCreate ?? false,
		},
	});

	const gmail = new FakeGmail(mailbox);
	const tokens = {
		async accessTokenFor(
			_userId: string,
			_source: SyncSource,
		): Promise<{ outcome: "ok"; accessToken: string }> {
			return { outcome: "ok", accessToken: "token" };
		},
	} as unknown as MailboxTokenService;

	const state = new SyncStateService(db);
	const stamp = new ActivityStampService(db);
	const directory = new CompanyDirectoryService(agent);
	const log = new EnrichmentLogService(db, stamp);
	const match = new MailboxMatchService(db, directory, agent, log);
	const threads = new ThreadWriterService(db, match, stamp);
	const service = new GmailSyncService(
		db,
		gmail as unknown as GmailClient,
		tokens,
		state,
		threads,
	);

	return { marker, userId, mailbox, row, gmail, service };
}

async function addContact(
	marker: string,
	email: string,
	options: { domain?: string | null } = {},
) {
	const company = await db.company.create({
		data: {
			name: `Company ${marker} ${email}`,
			domain: options.domain ?? null,
		},
		select: { id: true },
	});

	const contact = await db.contact.create({
		data: {
			firstName: "Customer",
			lastName: "Person",
			email,
			companyId: company.id,
		},
		select: { id: true, companyId: true },
	});

	return { company, contact };
}

function backfillInput(
	setup: Kit,
	overrides: Partial<GmailBackfillInput> = {},
): GmailBackfillInput {
	return {
		userId: setup.userId,
		after: new Date("2025-01-01T00:00:00.000Z"),
		before: new Date("2025-01-02T00:00:00.000Z"),
		dryRun: false,
		max: 10,
		...overrides,
	};
}

function message(input: {
	id: string;
	rfc: string;
	from: string;
	to: string;
	sentAt?: Date;
	subject?: string;
	body?: string;
	references?: string;
}): GmailMessage {
	const sentAt = input.sentAt ?? new Date("2025-01-01T10:00:00.000Z");
	const headers = [
		{ name: "Message-ID", value: input.rfc },
		{ name: "From", value: input.from },
		{ name: "To", value: input.to },
		{ name: "Date", value: sentAt.toUTCString() },
		{ name: "Subject", value: input.subject ?? "Pricing" },
	];

	if (input.references) {
		headers.push({ name: "References", value: input.references });
	}

	return {
		id: input.id,
		threadId: `thread-${input.id}`,
		internalDate: String(sentAt.getTime()),
		payload: {
			mimeType: "text/plain",
			headers,
			body: {
				data: Buffer.from(input.body ?? "The numbers you asked for.").toString(
					"base64url",
				),
			},
		},
	};
}

async function stored(rfcMessageId: string) {
	return db.emailMessage.findUnique({
		where: { rfcMessageId },
		select: {
			id: true,
			gmailMessageId: true,
			thread: {
				select: {
					contactId: true,
					companyId: true,
					messageCount: true,
					activity: { select: { id: true } },
				},
			},
		},
	});
}

async function clean(marker: string): Promise<void> {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: marker } },
	});
	await db.suppressedContact.deleteMany({
		where: {
			OR: [{ email: { contains: marker } }, { email: "customer@gmail.com" }],
		},
	});
	await db.contact.deleteMany({
		where: {
			OR: [{ email: { contains: marker } }, { email: "customer@gmail.com" }],
		},
	});
	await db.company.deleteMany({
		where: {
			OR: [{ name: { contains: marker } }, { domain: { contains: marker } }],
		},
	});
	await db.mailboxSync.deleteMany({
		where: { userId: { contains: marker } },
	});
	await db.user.deleteMany({ where: { id: { contains: marker } } });
}

afterAll(async () => {
	await clean(suffix);
});

describe("GmailSyncService first run", () => {
	it("stores the cursor without importing existing historical messages", async () => {
		const setup = await kit("first-run", { cursor: null });

		const outcome = await setup.service.sync(setup.row);

		expect(outcome.status).toBe("synced");
		expect(setup.gmail.historyCalls).toHaveLength(0);
		expect(setup.gmail.listMessageCalls).toHaveLength(0);
		expect(setup.gmail.getMessageIds).toHaveLength(0);
		expect(
			await db.emailMessage.count({
				where: { syncedByUserId: setup.userId },
			}),
		).toBe(0);

		const row = await db.mailboxSync.findUnique({
			where: { id: setup.row.id },
			select: { cursor: true },
		});
		expect(row?.cursor).toBe("history-start");
	});
});

describe("GmailSyncService backfill", () => {
	it("imports an older free-mail contact message without moving the cursor", async () => {
		const setup = await kit("backfill-import", { cursor: "live-cursor" });
		const { contact } = await addContact(setup.marker, "customer@gmail.com");
		const rfc = `backfill-${setup.marker}@mail.test`;

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-backfill-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-backfill-1",
			message({
				id: "gmail-backfill-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: "customer@gmail.com",
			}),
		);

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.messagesWritten).toBe(1);
		expect(outcome.messagesMatched).toBe(1);
		const saved = await stored(rfc);
		expect(saved?.gmailMessageId).toBe("gmail-backfill-1");
		expect(saved?.thread.contactId).toBe(contact.id);
		expect(saved?.thread.activity).not.toBeNull();
		expect(saved?.thread.messageCount).toBe(1);

		const row = await db.mailboxSync.findUnique({
			where: { id: setup.row.id },
			select: { cursor: true },
		});
		expect(row?.cursor).toBe("live-cursor");
	});

	it("does not duplicate a rerun with the same Gmail message id", async () => {
		const setup = await kit("backfill-gmail-duplicate", {
			cursor: "live-cursor",
		});
		const email = `customer-${setup.marker}@gmail.com`;
		await addContact(setup.marker, email);
		const rfc = `gmail-duplicate-${setup.marker}@mail.test`;

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-duplicate-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-duplicate-1",
			message({
				id: "gmail-duplicate-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: email,
			}),
		);

		await setup.service.backfill(backfillInput(setup));
		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.messagesWritten).toBe(0);
		expect(setup.gmail.getMessageIds).toEqual(["gmail-duplicate-1"]);
		expect(await db.emailMessage.count({ where: { rfcMessageId: rfc } })).toBe(
			1,
		);
	});

	it("does not duplicate a rerun with the same RFC message id", async () => {
		const setup = await kit("backfill-rfc-duplicate", {
			cursor: "live-cursor",
		});
		const email = `customer-${setup.marker}@gmail.com`;
		await addContact(setup.marker, email);
		const rfc = `rfc-duplicate-${setup.marker}@mail.test`;

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-rfc-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-rfc-1",
			message({
				id: "gmail-rfc-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: email,
			}),
		);
		await setup.service.backfill(backfillInput(setup));

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-rfc-2" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-rfc-2",
			message({
				id: "gmail-rfc-2",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: email,
			}),
		);

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.messagesWritten).toBe(0);
		expect(await db.emailMessage.count({ where: { rfcMessageId: rfc } })).toBe(
			1,
		);
	});

	it("does not write records during a dry run", async () => {
		const setup = await kit("backfill-dry-run", { cursor: "live-cursor" });
		const email = `customer-${setup.marker}@gmail.com`;
		await addContact(setup.marker, email);
		const rfc = `dry-run-${setup.marker}@mail.test`;

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-dry-run-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-dry-run-1",
			message({
				id: "gmail-dry-run-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: email,
			}),
		);

		const outcome = await setup.service.backfill(
			backfillInput(setup, {
				dryRun: true,
				q: `from:${email}`,
			}),
		);

		expect(outcome.messagesWouldFetch).toBe(1);
		expect(setup.gmail.getMessageIds).toHaveLength(0);
		expect(await stored(rfc)).toBeNull();
		expect(setup.gmail.listMessageCalls[0]?.query).toBe(`from:${email}`);
	});

	it("does not create a company for an unknown free-mail address", async () => {
		const setup = await kit("unknown-free-mail", {
			autoCreate: true,
			cursor: "live-cursor",
		});
		const rfc = `unknown-free-mail-${setup.marker}@mail.test`;
		const before = await db.company.count({ where: { domain: "gmail.com" } });

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-unknown-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-unknown-1",
			message({
				id: "gmail-unknown-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: `unknown-${setup.marker}@gmail.com`,
			}),
		);

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.messagesWritten).toBe(0);
		expect(await stored(rfc)).toBeNull();
		expect(await db.company.count({ where: { domain: "gmail.com" } })).toBe(
			before,
		);
	});

	it("does not match a suppressed exact free-mail contact", async () => {
		const setup = await kit("suppressed-free-mail", {
			autoCreate: true,
			cursor: "live-cursor",
		});
		const email = `suppressed-${setup.marker}@gmail.com`;
		const rfc = `suppressed-free-mail-${setup.marker}@mail.test`;
		await addContact(setup.marker, email);
		await db.suppressedContact.create({
			data: { email, reason: "Deleted by a rep" },
		});

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "gmail-suppressed-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.messages.set(
			"gmail-suppressed-1",
			message({
				id: "gmail-suppressed-1",
				rfc: `<${rfc}>`,
				from: setup.mailbox,
				to: email,
			}),
		);

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.messagesWritten).toBe(0);
		expect(await stored(rfc)).toBeNull();
	});
});

describe("GmailSyncService history pagination", () => {
	it("processes every Gmail history page before it advances the cursor", async () => {
		const setup = await kit("history-pages", { cursor: "history-1" });
		const domain = `history-pages-${setup.marker}.test`;
		const email = `buyer@${domain}`;
		await addContact(setup.marker, email, { domain });
		const firstRfc = `history-first-${setup.marker}@mail.test`;
		const secondRfc = `history-second-${setup.marker}@mail.test`;

		setup.gmail.setHistoryPage(undefined, {
			history: [{ messagesAdded: [{ message: { id: "gmail-history-1" } }] }],
			nextPageToken: "page-2",
			historyId: "history-mid",
		});
		setup.gmail.setHistoryPage("page-2", {
			history: [{ messagesAdded: [{ message: { id: "gmail-history-2" } }] }],
			historyId: "history-final",
		});
		setup.gmail.messages.set(
			"gmail-history-1",
			message({
				id: "gmail-history-1",
				rfc: `<${firstRfc}>`,
				from: email,
				to: setup.mailbox,
			}),
		);
		setup.gmail.messages.set(
			"gmail-history-2",
			message({
				id: "gmail-history-2",
				rfc: `<${secondRfc}>`,
				from: email,
				to: setup.mailbox,
			}),
		);

		const outcome = await setup.service.sync(setup.row);

		expect(outcome.messagesWritten).toBe(2);
		expect(setup.gmail.historyCalls.map((call) => call.pageToken)).toEqual([
			undefined,
			"page-2",
		]);
		expect(await stored(firstRfc)).not.toBeNull();
		expect(await stored(secondRfc)).not.toBeNull();

		const row = await db.mailboxSync.findUnique({
			where: { id: setup.row.id },
			select: { cursor: true },
		});
		expect(row?.cursor).toBe("history-final");
	});
});
