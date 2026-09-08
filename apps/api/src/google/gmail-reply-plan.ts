import { z } from "zod";
import type { AddressInput } from "./gmail-rfc822";

export const storedRecipient = z.object({
	email: z.string().trim().min(1),
	name: z.string().nullable().catch(null),
	kind: z.enum(["to", "cc"]).catch("to"),
});

export type StoredRecipient = z.infer<typeof storedRecipient>;

export type StoredReplyMessage = {
	rfcMessageId: string;
	direction: "INBOUND" | "OUTBOUND";
	fromEmail: string;
	fromName: string | null;
	recipients: StoredRecipient[];
	sentAt: Date;
};

export type ReplyPlan = {
	anchor: StoredReplyMessage;
	to: AddressInput[];
	cc: AddressInput[];
	bcc: AddressInput[];
	references: string[];
	inReplyTo: string;
};

const MAX_REFERENCES = 20;

export function planReply(input: {
	messages: StoredReplyMessage[];
	mailbox: string;
	replyAll: boolean;
	extraCc?: string[];
	extraBcc?: string[];
}): ReplyPlan | null {
	const anchor = input.messages[input.messages.length - 1];
	if (!anchor) return null;

	const mailbox = input.mailbox.toLowerCase();
	const own = (email: string) => email.toLowerCase() === mailbox;

	const deduped = (list: AddressInput[]): AddressInput[] => {
		const seen = new Set<string>();
		const out: AddressInput[] = [];
		for (const entry of list) {
			const email = entry.email.toLowerCase();
			if (!email || own(email) || seen.has(email)) continue;
			seen.add(email);
			out.push({ email: entry.email, name: entry.name });
		}
		return out;
	};

	const anchorTo = anchor.recipients.filter((entry) => entry.kind === "to");
	const anchorCc = anchor.recipients.filter((entry) => entry.kind === "cc");

	let to: AddressInput[];
	let cc: AddressInput[];

	if (anchor.direction === "INBOUND") {
		to = [{ email: anchor.fromEmail, name: anchor.fromName }];
		if (input.replyAll) {
			to = deduped([...to, ...anchorTo]);
			cc = deduped(anchorCc);
		} else {
			to = deduped(to);
			cc = [];
		}
	} else {
		to = deduped(anchorTo);
		if (to.length === 0 && !own(anchor.fromEmail)) {
			to = [{ email: anchor.fromEmail, name: anchor.fromName }];
		}
		cc = input.replyAll ? deduped(anchorCc) : [];
	}

	for (const email of input.extraCc ?? []) cc.push({ email, name: null });
	cc = deduped(cc);
	const bcc = (input.extraBcc ?? []).map((email) => ({ email, name: null }));

	const chain = input.messages.map((message) => message.rfcMessageId);
	const references = [...new Set(chain)].slice(-MAX_REFERENCES);

	return {
		anchor,
		to,
		cc,
		bcc,
		references,
		inReplyTo: anchor.rfcMessageId,
	};
}
