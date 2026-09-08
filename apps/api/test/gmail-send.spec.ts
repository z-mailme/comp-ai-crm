import { describe, expect, it } from "bun:test";
import {
	planReply,
	type StoredReplyMessage,
} from "../src/google/gmail-reply-plan";
import {
	buildMimeMessage,
	cleanHeaderValue,
	encodeHeaderText,
	encodeRawMime,
} from "../src/google/gmail-rfc822";

const EMOJI = String.fromCharCode(0xd83d, 0xde0a);

function message(
	id: string,
	direction: "INBOUND" | "OUTBOUND",
	overrides: Partial<StoredReplyMessage> = {},
): StoredReplyMessage {
	return {
		rfcMessageId: id,
		direction,
		fromEmail:
			direction === "INBOUND" ? "customer@acme.test" : "rep@ourcompany.test",
		fromName: null,
		recipients: [],
		sentAt: new Date("2026-09-05T10:00:00.000Z"),
		...overrides,
	};
}

describe("rfc 822 builder", () => {
	it("builds a threaded reply with In-Reply-To and References", () => {
		const mime = buildMimeMessage({
			from: { email: "rep@ourcompany.test", name: "Rep" },
			to: [{ email: "customer@acme.test", name: "Customer" }],
			cc: [],
			bcc: [],
			subject: "Re: Pricing",
			body: "Thanks for the details.",
			messageId: "abc123@ourcompany.test",
			inReplyTo: "original@acme.test",
			references: ["root@acme.test", "original@acme.test"],
			sentAt: new Date("2026-09-07T12:00:00.000Z"),
		});

		expect(mime).toContain("From: Rep <rep@ourcompany.test>");
		expect(mime).toContain("To: Customer <customer@acme.test>");
		expect(mime).toContain("Subject: Re: Pricing");
		expect(mime).toContain("Message-ID: <abc123@ourcompany.test>");
		expect(mime).toContain("In-Reply-To: <original@acme.test>");
		expect(mime).toContain("References: <root@acme.test> <original@acme.test>");
		expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
		expect(mime).not.toContain("Bcc:");
	});

	it("encodes non-ASCII subjects as RFC 2047 encoded words", () => {
		const encoded = encodeHeaderText(`Café ${EMOJI}`);
		expect(encoded.startsWith("=?UTF-8?B?")).toBe(true);
		expect(encoded.endsWith("?=")).toBe(true);
		expect(encoded).not.toContain("Café");
	});

	it("keeps ASCII subjects literal", () => {
		expect(encodeHeaderText("Pricing question")).toBe("Pricing question");
	});

	it("strips header injection attempts from names and subjects", () => {
		expect(cleanHeaderValue("Evil\nBcc: target@x.test")).toBe(
			"Evil Bcc: target@x.test",
		);

		const mime = buildMimeMessage({
			from: { email: "rep@ourcompany.test", name: null },
			to: [{ email: "customer@acme.test", name: "Bad\r\nBcc: x@y.test" }],
			cc: [],
			bcc: [{ email: "hidden@ourcompany.test", name: null }],
			subject: "Hi\r\nBcc: attacker@x.test",
			body: "body",
			messageId: "abc123@ourcompany.test",
			inReplyTo: null,
			references: [],
			sentAt: new Date("2026-09-07T12:00:00.000Z"),
		});

		const headerBlock = mime.split("\r\n\r\n")[0] ?? "";
		const bccLines = headerBlock
			.split("\r\n")
			.filter((line) => line.startsWith("Bcc:"));
		expect(bccLines).toEqual(["Bcc: <hidden@ourcompany.test>"]);
		expect(headerBlock).toContain("Subject: Hi  Bcc: attacker@x.test");
	});

	it("encodes the body as UTF-8 base64 preserving emoji", () => {
		const mime = buildMimeMessage({
			from: { email: "rep@ourcompany.test", name: null },
			to: [{ email: "customer@acme.test", name: null }],
			cc: [],
			bcc: [],
			subject: "Hi",
			body: `Drieër it — Café ${EMOJI}`,
			messageId: "abc123@ourcompany.test",
			inReplyTo: null,
			references: [],
			sentAt: new Date("2026-09-07T12:00:00.000Z"),
		});

		const body64 = mime.split("\r\n\r\n")[1] ?? "";
		const decoded = Buffer.from(body64, "base64").toString("utf8");
		expect(decoded).toBe(`Drieër it — Café ${EMOJI}`);
	});

	it("normalises bare newlines to CRLF", () => {
		const mime = buildMimeMessage({
			from: { email: "rep@ourcompany.test", name: null },
			to: [{ email: "customer@acme.test", name: null }],
			cc: [],
			bcc: [],
			subject: "Hi",
			body: "line one\nline two",
			messageId: "abc123@ourcompany.test",
			inReplyTo: null,
			references: [],
			sentAt: new Date("2026-09-07T12:00:00.000Z"),
		});

		expect(mime.split("\r\n\r\n")[0]).not.toMatch(/[^\r]\n/);
	});

	it("produces a decodable base64url payload for the Gmail API", () => {
		const raw = encodeRawMime("From: a@b.test\r\n\r\nhello");
		expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(
			"From: a@b.test\r\n\r\nhello",
		);
		expect(raw).not.toContain("+");
		expect(raw).not.toContain("=");
	});
});

describe("reply plan", () => {
	it("replies to the sender of the last inbound message", () => {
		const plan = planReply({
			messages: [
				message("root@acme.test", "INBOUND", {
					recipients: [
						{ email: "rep@ourcompany.test", name: null, kind: "to" },
					],
				}),
			],
			mailbox: "rep@ourcompany.test",
			replyAll: false,
		});

		expect(plan?.to).toEqual([{ email: "customer@acme.test", name: null }]);
		expect(plan?.cc).toEqual([]);
		expect(plan?.inReplyTo).toBe("root@acme.test");
		expect(plan?.references).toEqual(["root@acme.test"]);
	});

	it("reply all keeps other recipients and drops our own mailbox", () => {
		const plan = planReply({
			messages: [
				message("root@acme.test", "INBOUND", {
					recipients: [
						{ email: "rep@ourcompany.test", name: "Rep", kind: "to" },
						{ email: "colleague@partner.test", name: null, kind: "to" },
						{ email: "watcher@acme.test", name: "Watcher", kind: "cc" },
					],
				}),
			],
			mailbox: "rep@ourcompany.test",
			replyAll: true,
		});

		expect(plan?.to.map((entry) => entry.email)).toEqual([
			"customer@acme.test",
			"colleague@partner.test",
		]);
		expect(plan?.cc.map((entry) => entry.email)).toEqual(["watcher@acme.test"]);
	});

	it("follows up on our own outbound message by addressing its recipients", () => {
		const plan = planReply({
			messages: [
				message("root@acme.test", "INBOUND"),
				message("reply-1@ourcompany.test", "OUTBOUND", {
					recipients: [{ email: "customer@acme.test", name: null, kind: "to" }],
				}),
			],
			mailbox: "rep@ourcompany.test",
			replyAll: true,
		});

		expect(plan?.to.map((entry) => entry.email)).toEqual([
			"customer@acme.test",
		]);
		expect(plan?.inReplyTo).toBe("reply-1@ourcompany.test");
		expect(plan?.references).toEqual([
			"root@acme.test",
			"reply-1@ourcompany.test",
		]);
	});

	it("carries explicit cc and bcc additions", () => {
		const plan = planReply({
			messages: [message("root@acme.test", "INBOUND")],
			mailbox: "rep@ourcompany.test",
			replyAll: false,
			extraCc: ["boss@ourcompany.test"],
			extraBcc: ["archive@ourcompany.test"],
		});

		expect(plan?.cc.map((entry) => entry.email)).toEqual([
			"boss@ourcompany.test",
		]);
		expect(plan?.bcc.map((entry) => entry.email)).toEqual([
			"archive@ourcompany.test",
		]);
	});

	it("dedupes recipients and caps the references chain", () => {
		const many = Array.from({ length: 30 }, (_, index) =>
			message(`m${index}@acme.test`, index % 2 === 0 ? "INBOUND" : "OUTBOUND", {
				recipients: [{ email: "customer@acme.test", name: null, kind: "to" }],
			}),
		);

		const plan = planReply({
			messages: many,
			mailbox: "rep@ourcompany.test",
			replyAll: true,
		});

		expect(plan?.references.length).toBe(20);
		expect(plan?.references[plan.references.length - 1]).toBe("m29@acme.test");
		expect(plan?.to).toHaveLength(1);
	});

	it("returns null when there is nothing to reply to", () => {
		expect(
			planReply({
				messages: [],
				mailbox: "rep@ourcompany.test",
				replyAll: false,
			}),
		).toBeNull();
	});
});
