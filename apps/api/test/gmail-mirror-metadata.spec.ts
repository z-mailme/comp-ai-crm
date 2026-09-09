import { afterAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	db,
	EmailDirection,
	GoogleSyncStatus,
	MailboxMatchStatus,
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
import type { GmailLabelSyncService } from "../src/google/gmail-label-sync.service";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import { MailboxListService } from "../src/google/mailbox-list.service";
import type { SyncSource } from "../src/mailbox/mailbox.constants";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import { MailboxDealMatchService } from "../src/mailbox/mailbox-deal-match.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

type Ok<T> = { outcome: "ok"; data: T };
type ListHistoryCall = Parameters<GmailClient["listHistory"]>[1];
type ListMessagesCall = Parameters<GmailClient["listMessages"]>[1];

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

const suffix = process.env.TEST_RUN_ID ?? "gmail-mirror-metadata-spec";

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
} as unknown as AgentTriggerService;

class FakeGmail {
	readonly listMessageCalls: unknown[] = [];
	readonly historyCalls: ListHistoryCall[] = [];
	readonly getMessageIds: string[] = [];
	readonly getMetadataIds: string[] = [];
	readonly messages = new Map<string, GmailMessage>();
	readonly metadata = new Map<string, GmailMessage>();
	private readonly listPages = new Map<string, MailboxResult<MessageList>>();
	private readonly historyPages = new Map<string, HistoryList>();
	private readonly profileData: Profile;

	constructor(mailbox: string) {
		this.profileData = { emailAddress: mailbox, historyId: "history-start" };
	}

	setListPage(pageToken: string | undefined, page: MessageList): void {
		this.listPages.set(pageToken ?? "", ok(page));
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
		const pageToken = options.pageToken ?? "";
		return this.listPages.get(pageToken) ?? ok({});
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

	async getMessageMetadata(
		_accessToken: string,
		id: string,
	): Promise<MailboxResult<GmailMessage>> {
		this.getMetadataIds.push(id);
		const message = this.metadata.get(id);
		if (message) return ok(message);

		return {
			outcome: "failed",
			reason: `Missing test metadata ${id}.`,
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
	mailboxList: MailboxListService;
};

async function kit(
	name: string,
	options: { cursor?: string | null } = {},
): Promise<Kit> {
	const marker = `${suffix}-${name}`;
	await clean(marker);

	const userId = `user-${marker}`;
	const mailbox = `rep-${marker}@example.test`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});

	const cursor = "cursor" in options ? options.cursor : null;
	const row = await db.mailboxSync.create({
		data: {
			userId,
			source: "gmail",
			status: GoogleSyncStatus.IDLE,
			cursor,
			autoCreate: false,
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
	const dealMatch = new MailboxDealMatchService(db);
	const threads = new ThreadWriterService(db, match, dealMatch, stamp);
	const service = new GmailSyncService(
		db,
		gmail as unknown as GmailClient,
		tokens,
		state,
		threads,
		{
			async sync() {
				return 0;
			},
		} as unknown as GmailLabelSyncService,
	);

	return {
		marker,
		userId,
		mailbox,
		row,
		gmail,
		service,
		mailboxList: new MailboxListService(db),
	};
}

async function clean(marker: string): Promise<void> {
	await db.activity.deleteMany({ where: { subject: { contains: marker } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: marker } },
	});
	await db.contact.deleteMany({ where: { email: { contains: marker } } });
	await db.company.deleteMany({ where: { name: { contains: marker } } });
	await db.mailboxSync.deleteMany({ where: { userId: { contains: marker } } });
	await db.user.deleteMany({ where: { id: { contains: marker } } });
}

afterAll(async () => {
	await clean(suffix);
});

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

function fullMessage(input: {
	id: string;
	rfc: string;
	from: string;
	to: string;
	threadId: string;
	labelIds: string[];
	sentAt?: Date;
	subject?: string;
}): GmailMessage {
	const sentAt = input.sentAt ?? new Date("2025-01-01T10:00:00.000Z");
	return {
		id: input.id,
		threadId: input.threadId,
		labelIds: input.labelIds,
		internalDate: String(sentAt.getTime()),
		payload: {
			mimeType: "text/plain",
			headers: [
				{ name: "Message-ID", value: input.rfc },
				{ name: "From", value: input.from },
				{ name: "To", value: input.to },
				{ name: "Date", value: sentAt.toUTCString() },
				{ name: "Subject", value: input.subject ?? "Pricing" },
			],
			body: {
				data: Buffer.from("The numbers you asked for.").toString("base64url"),
			},
		},
	};
}

async function seedLegacyMessage(
	setup: Kit,
	input: {
		gmailId: string;
		rfc: string;
		subject?: string;
		body?: string;
		sentAt?: Date;
		withCrmLinks?: boolean;
	},
) {
	const sentAt = input.sentAt ?? new Date("2025-01-01T10:00:00.000Z");
	const subject = input.subject ?? `Legacy ${input.gmailId}`;

	let companyId: string | null = null;
	let contactId: string | null = null;

	if (input.withCrmLinks) {
		const company = await db.company.create({
			data: { name: `Company ${setup.marker} ${input.gmailId}` },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Customer",
				lastName: "Person",
				email: `customer-${input.gmailId}-${setup.marker}@example.test`,
				companyId: company.id,
			},
			select: { id: true },
		});
		companyId = company.id;
		contactId = contact.id;
	}

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${setup.marker}-${input.rfc}`,
			subject,
			matchStatus: contactId
				? MailboxMatchStatus.MATCHED_CONTACT
				: MailboxMatchStatus.UNMATCHED,
			companyId,
			contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messageCount: 1,
		},
	});

	const message = await db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: input.rfc,
			syncedByUserId: setup.userId,
			gmailMessageId: input.gmailId,
			gmailThreadId: null,
			labelIds: [],
			direction: EmailDirection.INBOUND,
			fromEmail: `customer-${setup.marker}@example.test`,
			fromName: "Customer",
			recipients: [],
			subject,
			snippet: `snippet ${subject}`,
			body: input.body ?? `Body for ${subject}`,
			sentAt,
		},
	});

	let activityId: string | null = null;
	if (input.withCrmLinks) {
		const activity = await db.activity.create({
			data: {
				type: ActivityType.EMAIL,
				subject: `${setup.marker} ${subject}`,
				occurredAt: sentAt,
				companyId,
				contactId,
				createdById: setup.userId,
				emailThreadId: thread.id,
			},
			select: { id: true },
		});
		activityId = activity.id;
	}

	return { thread, message, companyId, contactId, activityId };
}

describe("Gmail mirror metadata refresh", () => {
	it("refreshes a legacy stored message without duplicating it or losing CRM links", async () => {
		const setup = await kit("legacy-refresh");
		const legacy = await seedLegacyMessage(setup, {
			gmailId: "g-legacy-1",
			rfc: `<rfc-${setup.marker}-1@mail.test>`,
			body: "Legacy body keep me.",
			withCrmLinks: true,
		});

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "g-legacy-1" }],
			resultSizeEstimate: 1,
		});
		setup.gmail.metadata.set("g-legacy-1", {
			id: "g-legacy-1",
			threadId: "gt-legacy-1",
			labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
		});

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesRefreshed).toBe(1);
		expect(outcome.messagesWritten).toBe(0);
		expect(outcome.messagesAlreadyStored).toBe(0);
		expect(setup.gmail.getMessageIds).toEqual([]);

		const rows = await db.emailMessage.findMany({
			where: { gmailMessageId: "g-legacy-1" },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(legacy.message.id);
		expect(rows[0]?.gmailThreadId).toBe("gt-legacy-1");
		expect(rows[0]?.labelIds).toEqual(["INBOX", "UNREAD", "IMPORTANT"]);
		expect(rows[0]?.body).toBe("Legacy body keep me.");
		expect(rows[0]?.rfcMessageId).toBe(legacy.message.rfcMessageId);

		const thread = await db.emailThread.findUniqueOrThrow({
			where: { id: legacy.thread.id },
			select: {
				contactId: true,
				companyId: true,
				matchStatus: true,
				activity: { select: { id: true } },
			},
		});
		expect(thread.contactId).toBe(legacy.contactId);
		expect(thread.companyId).toBe(legacy.companyId);
		expect(thread.matchStatus).toBe(MailboxMatchStatus.MATCHED_CONTACT);
		expect(thread.activity?.id ?? null).toBe(legacy.activityId);

		const again = await setup.service.backfill(backfillInput(setup));
		expect(again.messagesRefreshed).toBe(0);
		expect(again.messagesAlreadyStored).toBe(1);
		expect(
			await db.emailMessage.count({ where: { gmailMessageId: "g-legacy-1" } }),
		).toBe(1);
	});

	it("returns the refreshed message in the mailbox list and honours inbox filtering", async () => {
		const setup = await kit("mailbox-visible");
		await seedLegacyMessage(setup, {
			gmailId: "g-legacy-visible",
			rfc: `<rfc-${setup.marker}-visible@mail.test>`,
		});
		await seedLegacyMessage(setup, {
			gmailId: "g-legacy-archived",
			rfc: `<rfc-${setup.marker}-archived@mail.test>`,
		});

		const beforeInbox = await setup.mailboxList.threads(setup.userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(beforeInbox.rows).toHaveLength(0);

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "g-legacy-visible" }, { id: "g-legacy-archived" }],
			resultSizeEstimate: 2,
		});
		setup.gmail.metadata.set("g-legacy-visible", {
			id: "g-legacy-visible",
			threadId: "gt-visible",
			labelIds: ["INBOX", "UNREAD"],
		});
		setup.gmail.metadata.set("g-legacy-archived", {
			id: "g-legacy-archived",
			threadId: "gt-archived",
			labelIds: ["STARRED"],
		});

		const outcome = await setup.service.backfill(backfillInput(setup));
		expect(outcome.messagesRefreshed).toBe(2);

		const inbox = await setup.mailboxList.threads(setup.userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(inbox.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-visible",
		]);
		expect(inbox.rows[0]?.unread).toBe(true);

		const all = await setup.mailboxList.threads(setup.userId, {
			view: "all",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(all.rows.map((row) => row.providerThreadId).sort()).toEqual([
			"gt-archived",
			"gt-visible",
		]);

		const starred = await setup.mailboxList.threads(setup.userId, {
			view: "starred",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(starred.rows.map((row) => row.providerThreadId)).toEqual([
			"gt-archived",
		]);
	});

	it("groups a refreshed multi-message Gmail thread into one mailbox row", async () => {
		const setup = await kit("multi-message-thread");
		await seedLegacyMessage(setup, {
			gmailId: "g-thread-1",
			rfc: `<rfc-${setup.marker}-t1@mail.test>`,
			sentAt: new Date("2025-01-01T10:00:00.000Z"),
		});
		await seedLegacyMessage(setup, {
			gmailId: "g-thread-2",
			rfc: `<rfc-${setup.marker}-t2@mail.test>`,
			sentAt: new Date("2025-01-01T11:00:00.000Z"),
		});

		setup.gmail.setListPage(undefined, {
			messages: [{ id: "g-thread-1" }, { id: "g-thread-2" }],
			resultSizeEstimate: 2,
		});
		for (const id of ["g-thread-1", "g-thread-2"]) {
			setup.gmail.metadata.set(id, {
				id,
				threadId: "gt-shared-thread",
				labelIds: ["INBOX"],
			});
		}

		const outcome = await setup.service.backfill(backfillInput(setup));
		expect(outcome.messagesRefreshed).toBe(2);

		const inbox = await setup.mailboxList.threads(setup.userId, {
			view: "inbox",
			unreadOnly: false,
			starredOnly: false,
			limit: 50,
		});
		expect(inbox.rows).toHaveLength(1);
		expect(inbox.rows[0]?.providerThreadId).toBe("gt-shared-thread");
		expect(inbox.rows[0]?.messageCount).toBe(2);
	});

	it("writes new messages and refreshes legacy ones with distinct counts in a full import", async () => {
		const setup = await kit("full-import");
		const legacy = await seedLegacyMessage(setup, {
			gmailId: "g-legacy-full",
			rfc: `<rfc-${setup.marker}-legacy@mail.test>`,
			body: "Legacy body keep me.",
			withCrmLinks: true,
		});
		const complete = await db.emailThread.create({
			data: {
				rootMessageId: `root-${setup.marker}-complete`,
				subject: "Complete",
				matchStatus: MailboxMatchStatus.UNMATCHED,
				firstMessageAt: new Date("2025-01-01T09:00:00.000Z"),
				lastMessageAt: new Date("2025-01-01T09:00:00.000Z"),
				messageCount: 1,
			},
		});
		await db.emailMessage.create({
			data: {
				threadId: complete.id,
				rfcMessageId: `<rfc-${setup.marker}-complete@mail.test>`,
				syncedByUserId: setup.userId,
				gmailMessageId: "g-complete",
				gmailThreadId: "gt-complete",
				labelIds: ["INBOX"],
				direction: EmailDirection.INBOUND,
				fromEmail: `customer-${setup.marker}@example.test`,
				recipients: [],
				subject: "Complete",
				sentAt: new Date("2025-01-01T09:00:00.000Z"),
			},
		});

		setup.gmail.setListPage(undefined, {
			messages: [
				{ id: "g-legacy-full" },
				{ id: "g-complete" },
				{ id: "g-new-1" },
			],
			resultSizeEstimate: 3,
		});
		setup.gmail.metadata.set("g-legacy-full", {
			id: "g-legacy-full",
			threadId: "gt-legacy-full",
			labelIds: ["INBOX"],
		});
		setup.gmail.messages.set(
			"g-new-1",
			fullMessage({
				id: "g-new-1",
				rfc: `<rfc-${setup.marker}-new@mail.test>`,
				from: `customer-${setup.marker}@example.test`,
				to: setup.mailbox,
				threadId: "gt-new-1",
				labelIds: ["INBOX", "UNREAD"],
			}),
		);

		const outcome = await setup.service.backfill(backfillInput(setup));

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBe(1);
		expect(outcome.messagesRefreshed).toBe(1);
		expect(outcome.messagesAlreadyStored).toBe(1);
		expect(setup.gmail.getMetadataIds).toEqual(["g-legacy-full"]);

		const written = await db.emailMessage.findUniqueOrThrow({
			where: { rfcMessageId: `rfc-${setup.marker}-new@mail.test` },
		});
		expect(written.gmailThreadId).toBe("gt-new-1");
		expect(written.labelIds).toEqual(["INBOX", "UNREAD"]);

		const legacyRow = await db.emailMessage.findUniqueOrThrow({
			where: { id: legacy.message.id },
		});
		expect(legacyRow.gmailThreadId).toBe("gt-legacy-full");
		expect(legacyRow.body).toBe("Legacy body keep me.");

		const thread = await db.emailThread.findUniqueOrThrow({
			where: { id: legacy.thread.id },
			select: { contactId: true, companyId: true },
		});
		expect(thread.contactId).toBe(legacy.contactId);
		expect(thread.companyId).toBe(legacy.companyId);
	});

	it("processes new writes and legacy refreshes within one budget and stays idempotent", async () => {
		const setup = await kit("resumable-refresh");
		for (let index = 1; index <= 3; index += 1) {
			await seedLegacyMessage(setup, {
				gmailId: `g-batch-${index}`,
				rfc: `<rfc-${setup.marker}-b${index}@mail.test>`,
			});
			setup.gmail.metadata.set(`g-batch-${index}`, {
				id: `g-batch-${index}`,
				threadId: `gt-batch-${index}`,
				labelIds: ["INBOX"],
			});
		}
		setup.gmail.messages.set(
			"g-batch-new",
			fullMessage({
				id: "g-batch-new",
				rfc: `<rfc-${setup.marker}-new@mail.test>`,
				from: `customer-${setup.marker}@example.test`,
				to: setup.mailbox,
				threadId: "gt-batch-new",
				labelIds: ["INBOX"],
			}),
		);
		setup.gmail.setListPage(undefined, {
			messages: [
				{ id: "g-batch-1" },
				{ id: "g-batch-2" },
				{ id: "g-batch-3" },
				{ id: "g-batch-new" },
			],
			resultSizeEstimate: 4,
		});

		const first = await setup.service.backfill(
			backfillInput(setup, { max: 4 }),
		);
		expect(first.messagesWritten).toBe(1);
		expect(first.messagesRefreshed).toBe(3);
		expect(first.messagesRemaining).toBe(0);

		const second = await setup.service.backfill(
			backfillInput(setup, { max: 4 }),
		);
		expect(second.messagesWritten).toBe(0);
		expect(second.messagesRefreshed).toBe(0);
		expect(second.messagesRemaining).toBe(0);
		expect(second.messagesAlreadyStored).toBe(4);
		expect(
			await db.emailMessage.count({
				where: { gmailMessageId: { in: ["g-batch-1", "g-batch-new"] } },
			}),
		).toBe(2);

		const refreshed = await db.emailMessage.count({
			where: {
				gmailMessageId: { in: ["g-batch-1", "g-batch-2", "g-batch-3"] },
				gmailThreadId: { not: null },
			},
		});
		expect(refreshed).toBe(3);
	});
});

describe("Gmail live history sync", () => {
	it("requests and applies all four history event types", async () => {
		const setup = await kit("history-types", { cursor: "cursor-start" });

		const deleted = await seedLegacyMessage(setup, {
			gmailId: "g-del-1",
			rfc: `<rfc-${setup.marker}-del@mail.test>`,
		});
		const labelled = await seedLegacyMessage(setup, {
			gmailId: "g-label-1",
			rfc: `<rfc-${setup.marker}-label@mail.test>`,
		});
		const unlabelled = await seedLegacyMessage(setup, {
			gmailId: "g-unlabel-1",
			rfc: `<rfc-${setup.marker}-unlabel@mail.test>`,
		});
		await db.emailMessage.update({
			where: { id: unlabelled.message.id },
			data: { labelIds: ["INBOX", "STARRED"] },
		});

		setup.gmail.messages.set(
			"g-added-1",
			fullMessage({
				id: "g-added-1",
				rfc: `<rfc-${setup.marker}-added@mail.test>`,
				from: `customer-${setup.marker}@example.test`,
				to: setup.mailbox,
				threadId: "gt-added-1",
				labelIds: ["INBOX"],
			}),
		);
		setup.gmail.setHistoryPage(undefined, {
			history: [
				{
					messagesAdded: [{ message: { id: "g-added-1" } }],
					messagesDeleted: [{ message: { id: "g-del-1" } }],
					labelsAdded: [
						{
							message: { id: "g-label-1", threadId: "gt-label-1" },
							labelIds: ["STARRED"],
						},
					],
					labelsRemoved: [
						{
							message: { id: "g-unlabel-1", threadId: "gt-unlabel-1" },
							labelIds: ["STARRED"],
						},
					],
				},
			],
			historyId: "history-next",
		});

		const outcome = await setup.service.sync(setup.row);

		expect(outcome.status).toBe("synced");
		expect(setup.gmail.historyCalls[0]?.historyTypes).toEqual([
			"messageAdded",
			"messageDeleted",
			"labelAdded",
			"labelRemoved",
		]);

		const added = await db.emailMessage.findUnique({
			where: { rfcMessageId: `rfc-${setup.marker}-added@mail.test` },
		});
		expect(added?.gmailThreadId).toBe("gt-added-1");
		expect(added?.labelIds).toEqual(["INBOX"]);

		expect(
			await db.emailMessage.count({ where: { gmailMessageId: "g-del-1" } }),
		).toBe(0);
		expect(
			await db.emailThread.count({ where: { id: deleted.thread.id } }),
		).toBe(1);

		const labelledRow = await db.emailMessage.findUniqueOrThrow({
			where: { id: labelled.message.id },
		});
		expect(labelledRow.gmailThreadId).toBe("gt-label-1");
		expect(labelledRow.labelIds).toContain("STARRED");

		const unlabelledRow = await db.emailMessage.findUniqueOrThrow({
			where: { id: unlabelled.message.id },
		});
		expect(unlabelledRow.labelIds).toContain("INBOX");
		expect(unlabelledRow.labelIds).not.toContain("STARRED");

		const row = await db.mailboxSync.findUniqueOrThrow({
			where: { id: setup.row.id },
			select: { cursor: true },
		});
		expect(row.cursor).toBe("history-next");
	});
});
