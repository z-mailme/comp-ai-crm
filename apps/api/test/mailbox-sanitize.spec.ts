import { afterAll, describe, expect, it } from "bun:test";
import {
	sanitizeIncomingMessage,
	sanitizeMailboxJson,
	sanitizeMailboxText,
} from "../src/mailbox/sanitize";

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const LONE_HIGH = String.fromCharCode(0xd83d);
const LONE_LOW = String.fromCharCode(0xde00);
const EMOJI = String.fromCharCode(0xd83d, 0xde0a);
const PRODUCTION_GMAIL_MESSAGE_ID = "1929e738df7f0bb94";

const itWithDb = process.env.DATABASE_URL ? it : it.skip;

function wellFormed(value: string): boolean {
	try {
		encodeURIComponent(value);
		return true;
	} catch {
		return false;
	}
}

describe("mailbox sanitizer", () => {
	it("removes only NUL characters from text", () => {
		expect(sanitizeMailboxText(`A${NUL}é\n\t${EMOJI}`)).toBe(`Aé\n\t${EMOJI}`);
	});

	it("recursively removes NUL characters from JSON string values", () => {
		const value = sanitizeMailboxJson({
			subject: `Hi${NUL}`,
			nested: [`A${NUL}`, { html: `<p>Café${NUL} 😊</p>` }],
			count: 1,
			ok: true,
			none: null,
		});

		expect(JSON.stringify(value)).not.toContain("\\u0000");
		expect(value).toEqual({
			subject: "Hi",
			nested: ["A", { html: "<p>Café 😊</p>" }],
			count: 1,
			ok: true,
			none: null,
		});
	});

	it("keeps mailbox identity fields unchanged", () => {
		const message = sanitizeIncomingMessage({
			rfcMessageId: `rfc${NUL}`,
			rootId: `root${NUL}`,
			gmailMessageId: `gmail${NUL}`,
			subject: `Subject${NUL}`,
			from: { email: "buyer@example.test", name: `Buyer${NUL}` },
			recipients: [
				{ email: "rep@example.test", name: `Rep${NUL}`, kind: "to" as const },
			],
			body: `Body${NUL}`,
			sentAt: new Date("2026-09-06T00:00:00.000Z"),
		});

		expect(message.rfcMessageId).toBe(`rfc${NUL}`);
		expect(message.rootId).toBe(`root${NUL}`);
		expect(message.gmailMessageId).toBe(`gmail${NUL}`);
		expect(message.subject).toBe("Subject");
		expect(message.from.name).toBe("Buyer");
		expect(message.recipients[0]?.name).toBe("Rep");
		expect(message.body).toBe("Body");
	});
});

describe("malformed Unicode from external mail", () => {
	it("leaves a plain ASCII message untouched", () => {
		const text = "Booking confirmed for Saturday 14:00. Thanks!";
		expect(sanitizeMailboxText(text)).toBe(text);
	});

	it("preserves valid UTF-8 with emoji and accented characters", () => {
		const text = `Café ${EMOJI} àéîõü ñ ÇŒ`;
		expect(sanitizeMailboxText(text)).toBe(text);
	});

	it("preserves smart quotes, dashes and ellipses", () => {
		const text = "“Quoted” — ‘single’ … €50";
		expect(sanitizeMailboxText(text)).toBe(text);
	});

	it("replaces a lone high surrogate without losing the rest of the message", () => {
		const dirty = `See you at the venue ${LONE_HIGH}bring the arch`;
		expect(sanitizeMailboxText(dirty)).toBe(
			`See you at the venue ${REPLACEMENT}bring the arch`,
		);
	});

	it("replaces a lone low surrogate without losing the rest of the message", () => {
		const dirty = `Price${LONE_LOW} list attached`;
		expect(sanitizeMailboxText(dirty)).toBe(
			`Price${REPLACEMENT} list attached`,
		);
	});

	it("replaces a truncated emoji pair at the end of a value", () => {
		const dirty = `Great ${LONE_HIGH}`;
		expect(sanitizeMailboxText(dirty)).toBe(`Great ${REPLACEMENT}`);
	});

	it("never throws on malformed input and never blanks the whole value", () => {
		const dirty = `bad${LONE_HIGH}${NUL}worse${LONE_LOW}`;
		const clean = sanitizeMailboxText(dirty);
		expect(clean).toBe(`bad${REPLACEMENT}worse${REPLACEMENT}`);
		expect(wellFormed(clean)).toBe(true);
	});

	it("keeps a valid surrogate pair intact", () => {
		const pair = String.fromCharCode(0xd83d, 0xde00);
		expect(sanitizeMailboxText(`party ${pair} time`)).toBe(
			`party ${pair} time`,
		);
	});

	it("regression: production gmail message 1929e738df7f0bb94 class of failure", () => {
		const dirty = {
			rfcMessageId: `<synthetic-${PRODUCTION_GMAIL_MESSAGE_ID}@mail.test>`,
			rootId: `<synthetic-root-${PRODUCTION_GMAIL_MESSAGE_ID}@mail.test>`,
			gmailMessageId: PRODUCTION_GMAIL_MESSAGE_ID,
			subject: `Quote follow-up ${LONE_HIGH}`,
			from: {
				email: "customer@example.test",
				name: `Anaïs ${LONE_LOW}`,
			},
			recipients: [
				{
					email: "rep@example.test",
					name: `Rep ${LONE_HIGH}`,
					kind: "to" as const,
				},
			],
			body: `Hi — the “gold arch” arrived.${NUL} See photos ${LONE_HIGH}thanks`,
			sentAt: new Date("2026-09-05T10:00:00.000Z"),
		};

		const safe = sanitizeIncomingMessage(dirty);

		expect(safe.subject).toBe(`Quote follow-up ${REPLACEMENT}`);
		expect(safe.from.name).toBe(`Anaïs ${REPLACEMENT}`);
		expect(safe.recipients[0]?.name).toBe(`Rep ${REPLACEMENT}`);
		expect(safe.body).toBe(
			`Hi — the “gold arch” arrived. See photos ${REPLACEMENT}thanks`,
		);
		expect(safe.rfcMessageId).toBe(dirty.rfcMessageId);
		expect(safe.gmailMessageId).toBe(PRODUCTION_GMAIL_MESSAGE_ID);

		for (const value of [
			safe.subject,
			safe.from.email,
			safe.from.name,
			safe.recipients[0]?.email,
			safe.recipients[0]?.name,
			safe.body,
		]) {
			if (typeof value !== "string") continue;
			expect(wellFormed(value)).toBe(true);
			expect(value.includes(NUL)).toBe(false);
		}

		expect(() => JSON.stringify(safe.recipients)).not.toThrow();
	});

	it("cleans malformed text inside recipient names and addresses", () => {
		const message = sanitizeIncomingMessage({
			subject: "Hi",
			from: { email: `buyer${LONE_HIGH}@example.test`, name: null },
			recipients: [
				{
					email: "rep@example.test",
					name: `Rep${NUL}${LONE_LOW}`,
					kind: "to" as const,
				},
			],
			body: "Body",
			sentAt: new Date("2026-09-06T00:00:00.000Z"),
		});

		expect(message.from.email).toBe(`buyer${REPLACEMENT}@example.test`);
		expect(message.recipients[0]?.name).toBe(`Rep${REPLACEMENT}`);
	});

	it("recursively cleans malformed strings inside JSON payloads", () => {
		const value = sanitizeMailboxJson({
			sender: { name: `A${LONE_HIGH}`, email: "a@example.test" },
			list: [`x${LONE_LOW}`, 3, null],
		});

		expect(value).toEqual({
			sender: { name: `A${REPLACEMENT}`, email: "a@example.test" },
			list: [`x${REPLACEMENT}`, 3, null],
		});
	});

	it("does not corrupt already-valid content on repeated passes", () => {
		const text = `Café ${EMOJI} “smart” — dashes … naïve`;
		expect(sanitizeMailboxText(sanitizeMailboxText(text))).toBe(text);
		expect(sanitizeMailboxText(text)).toBe(text);
	});

	it("returns the same string instance when there is nothing to fix", () => {
		const text = "plain value";
		expect(sanitizeMailboxText(text)).toBe(text);
	});
});

describe("postgres persistence after normalisation", () => {
	itWithDb(
		"emailMessage.create succeeds with formerly fatal malformed text",
		async () => {
			const { db, EmailDirection } = await import("@crm/db");
			const suffix = `sanitize-${Date.now()}`;
			const userId = `user-${suffix}`;
			const rootId = `<root-${suffix}@mail.test>`;

			try {
				await db.user.create({
					data: {
						id: userId,
						name: "Sanitize Rep",
						email: `${suffix}@ex.test`,
					},
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

				const safe = sanitizeIncomingMessage({
					rfcMessageId: `msg-${suffix}@mail.test`,
					rootId,
					subject: `Broken ${LONE_HIGH}`,
					from: { email: "customer@example.test", name: `Cu${LONE_LOW}stomer` },
					recipients: [
						{
							email: "rep@example.test",
							name: `Re${NUL}p`,
							kind: "to" as const,
						},
					],
					body: `Body ${LONE_HIGH}with${NUL} issues`,
					sentAt: new Date("2026-09-05T10:00:00.000Z"),
				});

				const created = await db.emailMessage.create({
					data: {
						threadId: thread.id,
						rfcMessageId: safe.rfcMessageId,
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
					select: { id: true, subject: true, body: true },
				});

				expect(created.subject).toBe(`Broken ${REPLACEMENT}`);
				expect(created.body).toBe(`Body ${REPLACEMENT}with issues`);
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
