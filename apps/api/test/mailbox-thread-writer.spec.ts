import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BusinessEventSource,
	BusinessUnitStatus,
	CommunicationChannel,
	CommunicationDirection,
	db,
	MailboxMatchStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxDealMatchService } from "../src/mailbox/mailbox-deal-match.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "thread-writer-spec";
const domain = `threads-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;
const businessUnitId = `business-unit-${suffix}`;
const channelAccountId = `channel-account-${suffix}`;
const person = `buyer@${domain}`;
const unmatchedPerson = `unknown-${suffix}@gmail.com`;
const freeMailPerson = `known-free-${suffix}@gmail.com`;
const ambiguousDomain = `ambiguous-${suffix}.test`;
const ambiguousPerson = `buyer@${ambiguousDomain}`;
const rootId = `<root-${suffix}@mail.test>`;
const dealRootId = `<deal-root-${suffix}@mail.test>`;
const ambiguousRootId = `<ambiguous-root-${suffix}@mail.test>`;
const freeMailRootId = `<free-mail-root-${suffix}@mail.test>`;
const duplicateRootId = `<duplicate-root-${suffix}@mail.test>`;
const unmatchedRootId = `<unmatched-root-${suffix}@mail.test>`;
const lateMatchRootId = `<late-match-root-${suffix}@mail.test>`;
const movedRoot = `outlook-conversation:${suffix}`;
const rootIds = [
	rootId,
	dealRootId,
	ambiguousRootId,
	freeMailRootId,
	duplicateRootId,
	movedRoot,
	unmatchedRootId,
	lateMatchRootId,
];

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const dealMatch = new MailboxDealMatchService(db);
const threads = new ThreadWriterService(db, match, dealMatch, stamp);

let row: MailboxSync;
let companyId: string;
let contactId: string;
let dealId: string;

function message(id: string, sentAt: Date, root = rootId): IncomingMessage {
	return {
		rfcMessageId: id,
		rootId: root,
		subject: "Pricing",
		from: { email: mailbox, name: "Test Rep" },
		recipients: [{ email: person, name: "A Buyer", kind: "to" }],
		body: "The numbers you asked for.",
		sentAt,
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

function unmatchedMessage(
	id: string,
	sentAt: Date,
	root = unmatchedRootId,
): IncomingMessage {
	return {
		rfcMessageId: id,
		rootId: root,
		subject: "Direct enquiry",
		from: { email: unmatchedPerson, name: "Unknown Customer" },
		recipients: [{ email: mailbox, name: "Test Rep", kind: "to" }],
		body: "Can you help with an event?",
		sentAt,
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

function threadMessage(input: {
	id: string;
	sentAt: Date;
	root: string;
	from: string;
	to: string;
	name?: string | null;
	subject?: string;
	body?: string;
}): IncomingMessage {
	return {
		rfcMessageId: input.id,
		rootId: input.root,
		subject: input.subject ?? "Event enquiry",
		from: { email: input.from, name: input.name ?? null },
		recipients: [{ email: input.to, name: null, kind: "to" }],
		body: input.body ?? "Can you help with an event?",
		sentAt: input.sentAt,
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function createDealFor(
	name: string,
	companyId: string,
	contactId: string | null,
	createdAt: Date,
) {
	const deal = await db.deal.create({
		data: {
			name,
			companyId,
			ownerId: userId,
			stage: "DEMO_BOOKED",
			createdAt,
		},
		select: { id: true },
	});

	if (contactId) {
		await db.dealContact.create({
			data: { dealId: deal.id, contactId },
		});
	}

	return deal;
}

async function clean() {
	await db.businessEvent.deleteMany({
		where: { correlationId: { in: rootIds } },
	});
	await db.conversation.deleteMany({
		where: { externalThreadId: { in: rootIds } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { in: rootIds } },
	});
	await db.contact.deleteMany({
		where: {
			email: { in: [person, unmatchedPerson, freeMailPerson, ambiguousPerson] },
		},
	});
	await db.company.deleteMany({
		where: {
			OR: [
				{ domain },
				{ domain: ambiguousDomain },
				{ name: `Late Match Co ${suffix}` },
				{ name: `Free Mail Co ${suffix}` },
			],
		},
	});
	await db.channelAccount.deleteMany({ where: { id: channelAccountId } });
	await db.businessUnit.deleteMany({ where: { id: businessUnitId } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	await db.businessUnit.create({
		data: {
			id: businessUnitId,
			name: `Thread Writer ${suffix}`,
			slug: `thread-writer-${suffix}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.channelAccount.create({
		data: {
			id: channelAccountId,
			businessUnitId,
			userId,
			channel: CommunicationChannel.EMAIL,
			provider: "gmail",
			externalAccountId: mailbox,
			label: `Thread Writer Gmail ${suffix}`,
		},
	});
	row = await db.mailboxSync.create({
		data: { userId, source: "gmail", autoCreate: false },
	});

	const company = await db.company.create({
		data: { name: "Buyer Co", domain },
		select: { id: true },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: {
			firstName: "A",
			lastName: "Buyer",
			email: person,
			companyId: company.id,
		},
		select: { id: true },
	});
	contactId = contact.id;
	const deal = await createDealFor(
		`Clear Deal ${suffix}`,
		companyId,
		contactId,
		new Date("2025-12-31T10:00:00Z"),
	);
	dealId = deal.id;
});

afterAll(clean);

describe("storing a synced email", () => {
	it("writes the message, the counts and the activity together", async () => {
		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			message(`<one-${suffix}@mail.test>`, new Date("2026-01-01T10:00:00Z")),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: {
				id: true,
				dealId: true,
				matchStatus: true,
				messageCount: true,
				activity: { select: { id: true, dealId: true } },
			},
		});

		expect(thread?.dealId).toBe(dealId);
		expect(thread?.matchStatus).toBe(MailboxMatchStatus.MATCHED_DEAL);
		expect(thread?.messageCount).toBe(1);
		expect(thread?.activity?.dealId).toBe(dealId);
		if (!thread) throw new Error("the email thread was not stored");

		const conversation = await db.conversation.findUnique({
			where: { emailThreadId: thread.id },
			select: {
				businessUnitId: true,
				channelAccountId: true,
				channel: true,
				companyId: true,
				contactId: true,
				dealId: true,
				messages: {
					select: {
						direction: true,
						emailMessageId: true,
						participants: { select: { role: true, email: true } },
					},
				},
				businessEvents: {
					select: {
						businessUnitId: true,
						type: true,
						source: true,
						outbox: { select: { destination: true } },
					},
				},
			},
		});

		expect(conversation).toMatchObject({
			businessUnitId,
			channelAccountId,
			channel: CommunicationChannel.EMAIL,
			companyId,
			contactId,
			dealId,
		});
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]?.direction).toBe(
			CommunicationDirection.OUTBOUND,
		);
		expect(conversation?.messages[0]?.participants.map((p) => p.role)).toEqual([
			"SENDER",
			"RECIPIENT",
		]);
		expect(conversation?.businessEvents).toEqual([
			{
				businessUnitId,
				type: "communication.sent",
				source: BusinessEventSource.GMAIL,
				outbox: [{ destination: "memory-bridge" }],
			},
		]);
	});

	it("repairs a thread whose projection was lost rather than skipping it forever", async () => {
		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { id: true },
		});
		if (!thread) throw new Error("the first message was not stored");

		await db.activity.deleteMany({ where: { emailThreadId: thread.id } });
		await db.emailThread.update({
			where: { id: thread.id },
			data: { messageCount: 0 },
		});

		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			message(`<one-${suffix}@mail.test>`, new Date("2026-01-01T10:00:00Z")),
			await threads.context(),
		);

		expect(stored).toBe(false);

		const repaired = await db.emailThread.findUnique({
			where: { id: thread.id },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(repaired?.messageCount).toBe(1);
		expect(repaired?.activity).not.toBeNull();
	});

	it("lets one of two concurrent syncs win without failing the other", async () => {
		const parsed = message(
			`<race-${suffix}@mail.test>`,
			new Date("2026-01-02T10:00:00Z"),
		);
		const context = await threads.context();

		const results = await Promise.all([
			threads.store(row, { mailbox, origin: "gmail" }, parsed, context),
			threads.store(row, { mailbox, origin: "outlook" }, parsed, context),
		]);

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(
			await db.emailMessage.count({
				where: { rfcMessageId: parsed.rfcMessageId },
			}),
		).toBe(1);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(thread?.messageCount).toBe(2);
		expect(thread?.activity).not.toBeNull();
	});

	it("repairs the thread the message is already on when the root id has moved", async () => {
		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { id: true },
		});
		if (!thread) throw new Error("the first message was not stored");

		await db.activity.deleteMany({ where: { emailThreadId: thread.id } });
		await db.emailThread.update({
			where: { id: thread.id },
			data: { messageCount: 0 },
		});

		const stored = await threads.store(
			row,
			{ mailbox, origin: "outlook" },
			message(
				`<race-${suffix}@mail.test>`,
				new Date("2026-01-02T10:00:00Z"),
				movedRoot,
			),
			await threads.context(),
		);

		expect(stored).toBe(false);
		expect(
			await db.emailThread.count({ where: { rootMessageId: movedRoot } }),
		).toBe(0);

		const repaired = await db.emailThread.findUnique({
			where: { id: thread.id },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(repaired?.messageCount).toBe(2);
		expect(repaired?.activity).not.toBeNull();
	});

	it("stores an unmatched free-mail thread without CRM activity", async () => {
		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			unmatchedMessage(
				`<unmatched-one-${suffix}@mail.test>`,
				new Date("2026-01-03T10:00:00Z"),
			),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: unmatchedRootId },
			select: {
				companyId: true,
				contactId: true,
				matchStatus: true,
				messageCount: true,
				activity: { select: { id: true } },
			},
		});

		expect(thread).toEqual({
			companyId: null,
			contactId: null,
			matchStatus: MailboxMatchStatus.UNMATCHED,
			messageCount: 1,
			activity: null,
		});
	});

	it("keeps inbound and outbound Gmail on the same deal thread", async () => {
		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			threadMessage({
				id: `<deal-inbound-${suffix}@mail.test>`,
				root: dealRootId,
				from: person,
				to: mailbox,
				name: "A Buyer",
				sentAt: new Date("2026-01-02T10:00:00Z"),
			}),
			await threads.context(),
		);

		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			threadMessage({
				id: `<deal-outbound-${suffix}@mail.test>`,
				root: dealRootId,
				from: mailbox,
				to: person,
				name: "Test Rep",
				sentAt: new Date("2026-01-02T11:00:00Z"),
			}),
			await threads.context(),
		);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: dealRootId },
			select: {
				dealId: true,
				messageCount: true,
				messages: { orderBy: { sentAt: "asc" }, select: { direction: true } },
				activity: { select: { dealId: true } },
			},
		});

		expect(thread?.dealId).toBe(dealId);
		expect(thread?.activity?.dealId).toBe(dealId);
		expect(thread?.messageCount).toBe(2);
		expect(thread?.messages.map((message) => message.direction)).toEqual([
			"INBOUND",
			"OUTBOUND",
		]);
		expect(
			await db.activity.count({ where: { dealId, type: "EMAIL" } }),
		).toBeGreaterThan(0);
	});

	it("does not choose a deal when more than one active deal is plausible", async () => {
		const company = await db.company.create({
			data: { name: `Ambiguous Co ${suffix}`, domain: ambiguousDomain },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Many",
				lastName: "Deals",
				email: ambiguousPerson,
				companyId: company.id,
			},
			select: { id: true },
		});
		await createDealFor(
			`Ambiguous First ${suffix}`,
			company.id,
			contact.id,
			new Date("2026-01-01T09:00:00Z"),
		);
		await createDealFor(
			`Ambiguous Second ${suffix}`,
			company.id,
			contact.id,
			new Date("2026-01-01T09:05:00Z"),
		);

		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			threadMessage({
				id: `<ambiguous-${suffix}@mail.test>`,
				root: ambiguousRootId,
				from: ambiguousPerson,
				to: mailbox,
				name: "Many Deals",
				sentAt: new Date("2026-01-02T10:00:00Z"),
			}),
			await threads.context(),
		);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: ambiguousRootId },
			select: {
				companyId: true,
				contactId: true,
				dealId: true,
				matchStatus: true,
				activity: { select: { dealId: true } },
			},
		});

		expect(thread?.companyId).toBe(company.id);
		expect(thread?.contactId).toBe(contact.id);
		expect(thread?.dealId).toBeNull();
		expect(thread?.matchStatus).toBe(MailboxMatchStatus.MATCHED_CONTACT);
		expect(thread?.activity?.dealId).toBeNull();
	});

	it("matches a known free-mail contact to one clear deal", async () => {
		const company = await db.company.create({
			data: { name: `Free Mail Co ${suffix}`, domain: null },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Free",
				lastName: "Mail",
				email: freeMailPerson,
				companyId: company.id,
			},
			select: { id: true },
		});
		const deal = await createDealFor(
			`Free Mail Deal ${suffix}`,
			company.id,
			contact.id,
			new Date("2026-01-01T09:00:00Z"),
		);

		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			threadMessage({
				id: `<free-mail-${suffix}@mail.test>`,
				root: freeMailRootId,
				from: freeMailPerson,
				to: mailbox,
				name: "Free Mail",
				sentAt: new Date("2026-01-02T10:00:00Z"),
			}),
			await threads.context(),
		);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: freeMailRootId },
			select: {
				companyId: true,
				contactId: true,
				dealId: true,
				matchStatus: true,
				activity: { select: { dealId: true } },
			},
		});

		expect(thread?.companyId).toBe(company.id);
		expect(thread?.contactId).toBe(contact.id);
		expect(thread?.dealId).toBe(deal.id);
		expect(thread?.matchStatus).toBe(MailboxMatchStatus.MATCHED_DEAL);
		expect(thread?.activity?.dealId).toBe(deal.id);
	});

	it("does not duplicate a deal activity projection", async () => {
		const parsed = threadMessage({
			id: `<duplicate-${suffix}@mail.test>`,
			root: duplicateRootId,
			from: person,
			to: mailbox,
			name: "A Buyer",
			sentAt: new Date("2026-01-02T12:00:00Z"),
		});
		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			parsed,
			await threads.context(),
		);
		const projectedThread = await db.emailThread.findUnique({
			where: { rootMessageId: duplicateRootId },
			select: { id: true },
		});
		if (!projectedThread)
			throw new Error("the projected thread was not stored");

		await db.businessEvent.deleteMany({
			where: { correlationId: duplicateRootId },
		});
		await db.conversation.deleteMany({
			where: { emailThreadId: projectedThread.id },
		});

		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			parsed,
			await threads.context(),
		);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: duplicateRootId },
			select: { id: true, dealId: true },
		});

		expect(stored).toBe(false);
		expect(thread?.dealId).toBe(dealId);
		expect(
			await db.emailMessage.count({ where: { threadId: thread?.id } }),
		).toBe(1);
		expect(
			await db.activity.count({ where: { emailThreadId: thread?.id } }),
		).toBe(1);
		expect(
			await db.communicationMessage.count({
				where: { conversation: { emailThreadId: thread?.id } },
			}),
		).toBe(1);
		expect(
			await db.businessEvent.count({
				where: { correlationId: duplicateRootId },
			}),
		).toBe(1);
	});

	it("projects a stored unmatched thread after an exact contact and deal become known", async () => {
		await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			unmatchedMessage(
				`<late-match-one-${suffix}@mail.test>`,
				new Date("2026-01-03T10:00:00Z"),
				lateMatchRootId,
			),
			await threads.context(),
		);

		const company = await db.company.create({
			data: { name: `Late Match Co ${suffix}`, domain: null },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Known",
				lastName: "Customer",
				email: unmatchedPerson,
				companyId: company.id,
			},
			select: { id: true },
		});
		const deal = await createDealFor(
			`Late Match Deal ${suffix}`,
			company.id,
			contact.id,
			new Date("2026-01-03T10:05:00Z"),
		);

		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			unmatchedMessage(
				`<late-match-two-${suffix}@mail.test>`,
				new Date("2026-01-04T10:00:00Z"),
				lateMatchRootId,
			),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: lateMatchRootId },
			select: {
				companyId: true,
				contactId: true,
				dealId: true,
				matchStatus: true,
				messageCount: true,
				activity: {
					select: {
						companyId: true,
						contactId: true,
						dealId: true,
						emailThreadId: true,
					},
				},
			},
		});

		expect(thread?.companyId).toBe(company.id);
		expect(thread?.contactId).toBe(contact.id);
		expect(thread?.dealId).toBe(deal.id);
		expect(thread?.matchStatus).toBe(MailboxMatchStatus.MATCHED_DEAL);
		expect(thread?.messageCount).toBe(2);
		expect(thread?.activity).toMatchObject({
			companyId: company.id,
			contactId: contact.id,
			dealId: deal.id,
		});
		expect(
			await db.activity.count({
				where: { emailThreadId: thread?.activity?.emailThreadId },
			}),
		).toBe(1);
	});
});
