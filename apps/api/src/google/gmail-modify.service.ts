import { GMAIL_MODIFY_SCOPE, GOOGLE_PROVIDER_ID } from "@crm/auth";
import { type Db, Prisma } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { GmailClient } from "./gmail.client";
import { GMAIL_SYNC } from "./gmail-sync.config";
import type {
	MailboxActionInput,
	MailboxActionOutput,
} from "./google.contracts";

const ACTION_LABELS = {
	markRead: { add: [], remove: ["UNREAD"] },
	markUnread: { add: ["UNREAD"], remove: [] },
	star: { add: ["STARRED"], remove: [] },
	unstar: { add: [], remove: ["STARRED"] },
	important: { add: ["IMPORTANT"], remove: [] },
	unimportant: { add: [], remove: ["IMPORTANT"] },
	archive: { add: [], remove: ["INBOX"] },
	moveToInbox: { add: ["INBOX"], remove: [] },
	spam: { add: ["SPAM"], remove: ["INBOX"] },
	notSpam: { add: ["INBOX"], remove: ["SPAM"] },
	trash: { add: ["TRASH"], remove: [] },
	untrash: { add: [], remove: ["TRASH"] },
	applyLabel: { add: [], remove: [] },
	removeLabel: { add: [], remove: [] },
} satisfies Record<
	MailboxActionInput["action"],
	{ add: string[]; remove: string[] }
>;

@Injectable()
export class GmailModifyService {
	private readonly logger = new Logger(GmailModifyService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
	) {}

	async act(
		userId: string,
		input: MailboxActionInput,
	): Promise<MailboxActionOutput> {
		const scopes = await this.tokens.grantedScopes(userId, GOOGLE_PROVIDER_ID);
		if (!scopes.has(GMAIL_MODIFY_SCOPE)) {
			return outcome("scope-required", "Gmail modify permission not granted.");
		}

		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome === "needs-reconnect") {
			return outcome("reconnect-required", token.reason);
		}
		if (token.outcome !== "ok") {
			return outcome("not-connected", token.reason);
		}

		const labels = ACTION_LABELS[input.action];
		const add = [...labels.add];
		const remove = [...labels.remove];

		if (input.action === "applyLabel") {
			if (!input.labelId) return outcome("failed", "No label was given.");
			add.push(input.labelId);
		}
		if (input.action === "removeLabel") {
			if (!input.labelId) return outcome("failed", "No label was given.");
			remove.push(input.labelId);
		}

		const messages = await this.db.emailMessage.findMany({
			where: {
				syncedByUserId: userId,
				gmailThreadId: { in: input.providerThreadIds },
				gmailMessageId: { not: null },
			},
			select: { id: true, gmailMessageId: true },
		});

		if (messages.length === 0) {
			return outcome("failed", "No synced Gmail messages matched.");
		}

		const gmailIds = messages
			.map((message) => message.gmailMessageId)
			.filter((id): id is string => id !== null);

		for (const batch of chunked(gmailIds, GMAIL_SYNC.modify.batchSize)) {
			const result = await this.gmail.batchModify(token.accessToken, {
				ids: batch,
				addLabelIds: add,
				removeLabelIds: remove,
			});

			if (result.outcome === "rate-limited") {
				return {
					status: "rate-limited",
					reason: result.reason,
					modified: 0,
					retryAfterMs: result.retryAfterMs ?? null,
				};
			}
			if (result.outcome === "unauthorized") {
				return outcome("reconnect-required", result.reason);
			}
			if (result.outcome !== "ok") {
				return outcome("failed", result.reason);
			}
		}

		await this.applyToMirror(userId, gmailIds, add, remove);

		this.logger.log({
			message: "Gmail mailbox action applied",
			userId,
			action: input.action,
			messages: gmailIds.length,
			threads: input.providerThreadIds.length,
		});

		return { status: "applied", reason: null, modified: gmailIds.length };
	}

	private async applyToMirror(
		userId: string,
		gmailIds: readonly string[],
		add: readonly string[],
		remove: readonly string[],
	): Promise<void> {
		if (add.length > 0) {
			await this.db.$executeRaw(
				Prisma.sql`
					UPDATE "emailMessage"
					SET "labelIds" = (
						SELECT ARRAY(SELECT DISTINCT u FROM unnest("labelIds" || ${add as string[]}::text[]) AS u)
					)
					WHERE "syncedByUserId" = ${userId}
					AND "gmailMessageId" = ANY(${gmailIds as string[]}::text[])
				`,
			);
		}

		if (remove.length > 0) {
			await this.db.$executeRaw(
				Prisma.sql`
					UPDATE "emailMessage"
					SET "labelIds" = (
						SELECT ARRAY(SELECT u FROM unnest("labelIds") AS u WHERE u <> ALL(${remove as string[]}::text[]))
					)
					WHERE "syncedByUserId" = ${userId}
					AND "gmailMessageId" = ANY(${gmailIds as string[]}::text[])
				`,
			);
		}
	}
}

function outcome(
	status: MailboxActionOutput["status"],
	reason: string,
): MailboxActionOutput {
	return { status, reason, modified: 0 };
}

function chunked<T>(values: readonly T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		batches.push(values.slice(index, index + size));
	}
	return batches;
}
