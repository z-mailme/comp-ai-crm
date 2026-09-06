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

export function sanitizeMailboxText(value: string): string {
	return value.replaceAll(NUL, "");
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
			name: sanitizeMailboxTextNullable(recipient.name),
		})),
		body: sanitizeMailboxText(message.body),
		outlookWebLink: sanitizeMailboxTextNullable(message.outlookWebLink),
	};
}

function sanitizeParticipant(participant: Participant): Participant {
	return {
		...participant,
		name: sanitizeMailboxTextNullable(participant.name),
	};
}
