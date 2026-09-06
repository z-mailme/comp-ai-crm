import { describe, expect, it } from "bun:test";
import {
	sanitizeIncomingMessage,
	sanitizeMailboxJson,
	sanitizeMailboxText,
} from "../src/mailbox/sanitize";

describe("mailbox sanitizer", () => {
	it("removes only NUL characters from text", () => {
		expect(sanitizeMailboxText("A\u0000é\n\t😊")).toBe("Aé\n\t😊");
	});

	it("recursively removes NUL characters from JSON string values", () => {
		const value = sanitizeMailboxJson({
			subject: "Hi\u0000",
			nested: ["A\u0000", { html: "<p>Café\u0000 😊</p>" }],
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
			rfcMessageId: "rfc\u0000",
			rootId: "root\u0000",
			gmailMessageId: "gmail\u0000",
			subject: "Subject\u0000",
			from: { email: "buyer@example.test", name: "Buyer\u0000" },
			recipients: [
				{ email: "rep@example.test", name: "Rep\u0000", kind: "to" as const },
			],
			body: "Body\u0000",
			sentAt: new Date("2026-09-06T00:00:00.000Z"),
		});

		expect(message.rfcMessageId).toBe("rfc\u0000");
		expect(message.rootId).toBe("root\u0000");
		expect(message.gmailMessageId).toBe("gmail\u0000");
		expect(message.subject).toBe("Subject");
		expect(message.from.name).toBe("Buyer");
		expect(message.recipients[0]?.name).toBe("Rep");
		expect(message.body).toBe("Body");
	});
});
