import { afterAll, describe, expect, it } from "bun:test";
import {
	sanitizeIncomingMessage,
	sanitizeMailboxText,
} from "../src/mailbox/sanitize";

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const LONE_HIGH = String.fromCharCode(0xd83d);
const LONE_LOW = String.fromCharCode(0xde00);
const EMOJI = String.fromCharCode(0xd83d, 0xde0a);
const PRODUCTION_GMAIL_MESSAGE_ID = "1929e738df7f0bb94";

const itWithDb = process.env.DATABASE_URL ? it : it.skip;

type DbClient = Awaited<typeof import("@crm/db")>["db"];

type Case = {
	label: string;
	subject: string;
	body: string;
	fromName: string | null;
	expectedSubject: string;
	expectedBody: string;
	expectedFromName: string | null;
};

const CASES: Case[] = [
	{
		label: "normal ASCII",
		subject: "Booking confirmed for Saturday 14:00",
		body: "Plain ASCII body. Thanks!",
		fromName: "Plain Sender",
		expectedSubject: "Booking confirmed for Saturday 14:00",
		expectedBody: "Plain ASCII body. Thanks!",
		expectedFromName: "Plain Sender",
	},
	{
		label: "emoji",
		subject: `Party time ${EMOJI}`,
		body: `See you there ${EMOJI}${EMOJI}`,
		fromName: `Emoji ${EMOJI}`,
		expectedSubject: `Party time ${EMOJI}`,
		expectedBody: `See you there ${EMOJI}${EMOJI}`,
		expectedFromName: `Emoji ${EMOJI}`,
	},
	{
		label: "accented Unicode",
		subject: "Café àéîõü ñ ÇŒ naïve",
		body: "Anaïs and François visited Zürich.",
		fromName: "Anaïs Ünïcode",
		expectedSubject: "Café àéîõü ñ ÇŒ naïve",
		expectedBody: "Anaïs and François visited Zürich.",
		expectedFromName: "Anaïs Ünïcode",
	},
	{
		label: "smart punctuation",
		subject: "“Quoted” — ‘single’ … €50",
		body: "Dash — en–dash … ellipsis “quotes” ‘apostrophe’ €",
		fromName: "O’Neill — Sr.",
		expectedSubject: "“Quoted” — ‘single’ … €50",
		expectedBody: "Dash — en–dash … ellipsis “quotes” ‘apostrophe’ €",
		expectedFromName: "O’Neill — Sr.",
	},
	{
		label: "NUL-containing text after sanitisation",
		subject: `Invoice${NUL} 42`,
		body: `Total${NUL} due${NUL} now`,
		fromName: `Acc${NUL}ounts`,
		expectedSubject: "Invoice 42",
		expectedBody: "Total due now",
		expectedFromName: "Accounts",
	},
	{
		label: "lone high surrogate",
		subject: `See you ${LONE_HIGH}soon`,
		body: `Body ${LONE_HIGH}with high surrogate`,
		fromName: `High${LONE_HIGH}`,
		expectedSubject: `See you ${REPLACEMENT}soon`,
		expectedBody: `Body ${REPLACEMENT}with high surrogate`,
		expectedFromName: `High${REPLACEMENT}`,
	},
	{
		label: "lone low surrogate",
		subject: `Price${LONE_LOW} list`,
		body: `Body ${LONE_LOW}with low surrogate`,
		fromName: `Low${LONE_LOW}`,
		expectedSubject: `Price${REPLACEMENT} list`,
		expectedBody: `Body ${REPLACEMENT}with low surrogate`,
		expectedFromName: `Low${REPLACEMENT}`,
	},
	{
		label: "truncated sequence of the production failure class",
		subject: `Gold arch ${LONE_HIGH}`,
		body: `Truncated pair at end ${LONE_HIGH}`,
		fromName: `Truncated${LONE_LOW}`,
		expectedSubject: `Gold arch ${REPLACEMENT}`,
		expectedBody: `Truncated pair at end ${REPLACEMENT}`,
		expectedFromName: `Truncated${REPLACEMENT}`,
	},
	{
		label: "production fixture 1929e738df7f0bb94",
		subject: `Quote follow-up ${LONE_HIGH}`,
		body: `Hi — the “gold arch” arrived.${NUL} See photos ${LONE_HIGH}thanks`,
		fromName: `Anaïs ${LONE_LOW}`,
		expectedSubject: `Quote follow-up ${REPLACEMENT}`,
		expectedBody: `Hi — the “gold arch” arrived. See photos ${REPLACEMENT}thanks`,
		expectedFromName: `Anaïs ${REPLACEMENT}`,
	},
];

async function createHarness(db: DbClient, suffix: string) {
	const userId = `user-${suffix}`;
	const rootId = `<root-${suffix}@mail.test>`;
	await db.user.create({
		data: { id: userId, name: "Sanitize Rep", email: `${suffix}@ex.test` },
	});
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: rootId,
			subject: "Sanitize",
			matchStatus: "UNMATCHED",
			firstMessageAt: new Date("2026-09-05T10:00:00.000Z"),
			lastMessageAt: new Date("2026-09-05T10:00:00.000Z"),
			messageCount: 0,
		},
		select: { id: true },
	});
	return { userId, rootId, threadId: thread.id };
}

describe("postgres persistence of the ten failure classes", () => {
	for (const testCase of CASES) {
		itWithDb(`persists and returns ${testCase.label}`, async () => {
			const { db, EmailDirection } = await import("@crm/db");
			const suffix = `case-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
			const { userId, rootId, threadId } = await createHarness(db, suffix);

			try {
				const isProductionFixture =
					testCase.label.startsWith("production fixture");
				const safe = sanitizeIncomingMessage({
					rfcMessageId: `msg-${suffix}@mail.test`,
					rootId,
					gmailMessageId: isProductionFixture
						? PRODUCTION_GMAIL_MESSAGE_ID
						: undefined,
					subject: testCase.subject,
					from: { email: "customer@example.test", name: testCase.fromName },
					recipients: [
						{
							email: "rep@example.test",
							name: testCase.fromName,
							kind: "to" as const,
						},
					],
					body: testCase.body,
					sentAt: new Date("2026-09-05T10:00:00.000Z"),
				});

				const created = await db.emailMessage.create({
					data: {
						threadId,
						rfcMessageId: safe.rfcMessageId,
						gmailMessageId: safe.gmailMessageId,
						syncedByUserId: userId,
						direction: EmailDirection.INBOUND,
						fromEmail: safe.from.email,
						fromName: safe.from.name,
						recipients: JSON.parse(JSON.stringify(safe.recipients)),
						subject: safe.subject,
						snippet: safe.body.slice(0, 50),
						body: safe.body,
						sentAt: safe.sentAt,
					},
					select: { id: true },
				});

				const persisted = await db.emailMessage.findUniqueOrThrow({
					where: { id: created.id },
					select: {
						subject: true,
						body: true,
						fromName: true,
						recipients: true,
					},
				});

				expect(persisted.subject).toBe(testCase.expectedSubject);
				expect(persisted.body).toBe(testCase.expectedBody);
				expect(persisted.fromName).toBe(testCase.expectedFromName);

				const recipients = persisted.recipients as Array<{
					name?: string | null;
				}>;
				expect(recipients[0]?.name ?? null).toBe(testCase.expectedFromName);
			} finally {
				await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
				await db.user.deleteMany({ where: { id: userId } });
			}
		});
	}

	itWithDb(
		"persists malformed nested recipient name and value through Json",
		async () => {
			const { db, EmailDirection } = await import("@crm/db");
			const suffix = `nested-${Date.now()}`;
			const { userId, rootId, threadId } = await createHarness(db, suffix);

			try {
				const safe = sanitizeIncomingMessage({
					rfcMessageId: `msg-${suffix}@mail.test`,
					rootId,
					subject: "Nested",
					from: { email: `buyer${LONE_HIGH}@example.test`, name: null },
					recipients: [
						{
							email: "rep@example.test",
							name: `Re${NUL}p ${LONE_LOW}`,
							kind: "to" as const,
						},
					],
					body: "Body",
					sentAt: new Date("2026-09-05T10:00:00.000Z"),
				});

				const created = await db.emailMessage.create({
					data: {
						threadId,
						rfcMessageId: safe.rfcMessageId,
						syncedByUserId: userId,
						direction: EmailDirection.INBOUND,
						fromEmail: safe.from.email,
						fromName: safe.from.name,
						recipients: JSON.parse(JSON.stringify(safe.recipients)),
						subject: safe.subject,
						body: safe.body,
						sentAt: safe.sentAt,
					},
					select: { id: true, fromEmail: true, recipients: true },
				});

				expect(created.fromEmail).toBe(`buyer${REPLACEMENT}@example.test`);
				const recipients = created.recipients as Array<{ name?: string }>;
				expect(recipients[0]?.name).toBe(`Rep ${REPLACEMENT}`);
			} finally {
				await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
				await db.user.deleteMany({ where: { id: userId } });
			}
		},
	);

	itWithDb(
		"reproduces postgres 22021 without the sanitizer and passes with it",
		async () => {
			const { db, EmailDirection } = await import("@crm/db");
			const suffix = `probe-${Date.now()}`;
			const { userId, rootId, threadId } = await createHarness(db, suffix);

			const dirtySubject = `Gold arch ${LONE_HIGH}${"—".repeat(4)}`;
			const dirtyBody = `Photos ${LONE_LOW}${"€".repeat(4)}`;

			async function write(subject: string, body: string, tag: string) {
				return db.emailMessage.create({
					data: {
						threadId,
						rfcMessageId: `msg-${suffix}-${tag}@mail.test`,
						syncedByUserId: userId,
						direction: EmailDirection.INBOUND,
						fromEmail: "customer@example.test",
						recipients: [],
						subject,
						body,
						sentAt: new Date("2026-09-05T10:00:00.000Z"),
					},
					select: { id: true, subject: true, body: true },
				});
			}

			try {
				const rejected = await write(dirtySubject, dirtyBody, "raw").then(
					() => null,
					(cause: unknown) =>
						cause instanceof Error ? cause.message : String(cause),
				);

				expect(rejected).not.toBeNull();
				expect(rejected).toContain("22021");
				expect(rejected).toContain("0xe2");

				const stored = await write(
					sanitizeMailboxText(dirtySubject),
					sanitizeMailboxText(dirtyBody),
					"safe",
				);

				expect(stored.subject).toBe(`Gold arch ${REPLACEMENT}${"—".repeat(4)}`);
				expect(stored.body).toBe(`Photos ${REPLACEMENT}${"€".repeat(4)}`);
			} finally {
				await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
				await db.user.deleteMany({ where: { id: userId } });
			}
		},
	);

	itWithDb("sanitizer output is stable across ten classes", () => {
		for (const testCase of CASES) {
			expect(sanitizeMailboxText(testCase.subject)).toBe(
				testCase.expectedSubject,
			);
		}
	});
});

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
