import type { Prisma } from "@crm/db";
import type { Participant } from "./participants";

type MailboxRecipient = Participant & { kind: "to" | "cc" };

type MailboxTextMessage = {
	subject: string | null;
	from: Participant;
	recipients: MailboxRecipient[];
	body: string;
	outlookWebLink?: string | null;
};

const NUL = String.fromCharCode(0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;

export function sanitizeMailboxText(value: string): string {
	return replaceLoneSurrogates(value).replaceAll(NUL, "");
}

export function sanitizeMailboxTextNullable<
	T extends string | null | undefined,
>(value: T): T {
	return (typeof value === "string" ? sanitizeMailboxText(value) : value) as T;
}

export function sanitizeMailboxJson(
	value: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
	if (typeof value === "string") return sanitizeMailboxText(value);

	if (Array.isArray(value)) {
		return value.map((entry) =>
			sanitizeMailboxJson(entry as Prisma.InputJsonValue),
		);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				sanitizeMailboxJson(entry as Prisma.InputJsonValue),
			]),
		);
	}

	return value;
}

export function sanitizeIncomingMessage<T extends MailboxTextMessage>(
	message: T,
): T {
	return {
		...message,
		subject: sanitizeMailboxTextNullable(message.subject),
		from: sanitizeParticipant(message.from),
		recipients: message.recipients.map((recipient) => ({
			...recipient,
			email: sanitizeMailboxText(recipient.email),
			name: sanitizeMailboxTextNullable(recipient.name),
		})),
		body: sanitizeMailboxText(message.body),
		outlookWebLink: sanitizeMailboxTextNullable(message.outlookWebLink),
	};
}

function sanitizeParticipant(participant: Participant): Participant {
	return {
		...participant,
		email: sanitizeMailboxText(participant.email),
		name: sanitizeMailboxTextNullable(participant.name),
	};
}

function replaceLoneSurrogates(value: string): string {
	let result = "";
	let anchor = 0;

	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);

		if (code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX) {
			const next = value.charCodeAt(index + 1);
			if (next >= LOW_SURROGATE_MIN && next <= LOW_SURROGATE_MAX) {
				index += 1;
				continue;
			}
		} else if (code < LOW_SURROGATE_MIN || code > LOW_SURROGATE_MAX) {
			continue;
		}

		result += value.slice(anchor, index) + REPLACEMENT_CHARACTER;
		anchor = index + 1;
	}

	if (anchor === 0) return value;
	return result + value.slice(anchor);
}
