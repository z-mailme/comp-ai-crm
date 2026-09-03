import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	normaliseMessageId,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import {
	GmailClient,
	type GmailMessage,
	type HistoryList,
	type MessageList,
	type Profile,
} from "./gmail.client";
import type { GmailBackfillInput } from "./gmail-backfill";
import {
	type GmailHeader,
	header,
	plainTextBody,
	rootMessageId,
} from "./gmail-mime";
import { GMAIL_SYNC } from "./gmail-sync.config";

export type GmailSyncOutcome = {
	source: "gmail";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	threadsTouched?: number;
	reason?: string;
};

export type GmailBackfillOutcome = GmailSyncOutcome & {
	dryRun: boolean;
	after: string;
	before: string;
	max: number;
	q?: string;
	messagesMatched?: number;
	messagesAlreadyStored?: number;
	messagesWouldFetch?: number;
	pagesRead?: number;
	resultSizeEstimate?: number | null;
	truncated?: boolean;
};

type MailboxFailure<T> = Exclude<MailboxResult<T>, { outcome: "ok" }>;

type ListedBackfillMessages =
	| {
			outcome: "ok";
			ids: string[];
			pagesRead: number;
			resultSizeEstimate: number | null;
			truncated: boolean;
	  }
	| MailboxFailure<MessageList>;

@Injectable()
export class GmailSyncService {
	private readonly logger = new Logger(GmailSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(row: MailboxSync): Promise<GmailSyncOutcome> {
		const token = await this.tokens.accessTokenFor(row.userId, "gmail");

		if (token.outcome === "not-connected") {
			return {
				source: "gmail",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.handleFailure(row, profile);
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			await this.state.markFailed(row.id, "Gmail returned no mailbox address.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No mailbox address.",
			};
		}

		if (!row.cursor) {
			return this.start(row, profile.data.historyId ?? null);
		}

		return this.incremental(row, token.accessToken, mailbox, row.cursor);
	}

	async backfill(input: GmailBackfillInput): Promise<GmailBackfillOutcome> {
		const base = this.backfillBase(input);
		const row = await this.state.get(input.userId, "gmail");

		if (!row) {
			return {
				...base,
				status: "skipped",
				reason: "No Gmail sync row exists.",
			};
		}

		const token = await this.tokens.accessTokenFor(row.userId, "gmail");

		if (token.outcome === "not-connected") {
			return { ...base, status: "skipped", reason: token.reason };
		}

		if (token.outcome === "needs-reconnect") {
			return { ...base, status: "reconnect", reason: token.reason };
		}

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.backfillFailure(input, profile);
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			return { ...base, status: "failed", reason: "No mailbox address." };
		}

		const listed = await this.listBackfillMessages(token.accessToken, input);
		if (listed.outcome !== "ok") {
			return this.backfillFailure(input, listed);
		}

		const alreadyStored = await this.existingGmailIds(listed.ids);
		const pending = listed.ids.length - alreadyStored.size;

		if (input.dryRun) {
			return {
				...base,
				status: "synced",
				messagesMatched: listed.ids.length,
				messagesAlreadyStored: alreadyStored.size,
				messagesWouldFetch: pending,
				pagesRead: listed.pagesRead,
				resultSizeEstimate: listed.resultSizeEstimate,
				truncated: listed.truncated,
			};
		}

		const { written } = await this.ingest(
			row,
			token.accessToken,
			mailbox,
			listed.ids,
			{ maxMessages: input.max },
		);

		this.logger.log({
			message: "Gmail historical backfill",
			userId: row.userId,
			messagesWritten: written,
			messagesMatched: listed.ids.length,
			dryRun: false,
		});

		return {
			...base,
			status: "synced",
			messagesMatched: listed.ids.length,
			messagesAlreadyStored: alreadyStored.size,
			messagesWritten: written,
			pagesRead: listed.pagesRead,
			resultSizeEstimate: listed.resultSizeEstimate,
			truncated: listed.truncated,
		};
	}

	private async start(
		row: MailboxSync,
		historyId: string | null,
	): Promise<GmailSyncOutcome> {
		if (!historyId) {
			await this.state.markFailed(row.id, "Gmail returned no historyId.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No historyId to start from.",
			};
		}

		await this.state.settle(row.id, {
			cursor: historyId,
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message: "Gmail sync started — watching for new mail",
			userId: row.userId,
		});

		return { source: "gmail", userId: row.userId, status: "synced" };
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		startHistoryId: string,
	): Promise<GmailSyncOutcome> {
		let history = await this.gmail.listHistory(accessToken, {
			startHistoryId,
		});
		let finalHistoryId = startHistoryId;
		const ids = new Set<string>();

		while (history.outcome === "ok") {
			for (const entry of history.data.history ?? []) {
				for (const added of entry.messagesAdded ?? []) {
					if (added.message?.id) ids.add(added.message.id);
				}
			}

			finalHistoryId = history.data.historyId ?? finalHistoryId;

			const pageToken = history.data.nextPageToken;
			if (!pageToken) break;

			history = await this.gmail.listHistory(accessToken, {
				startHistoryId,
				pageToken,
			});
		}

		if (history.outcome === "cursor-invalid") {
			await this.state.clearCursor(row.id, history.reason);

			return {
				source: "gmail",
				userId: row.userId,
				status: "synced",
				reason: "History expired; resuming from now.",
			};
		}

		if (history.outcome !== "ok") {
			return this.handleFailure(row, history);
		}

		const { written, remaining } = await this.ingest(
			row,
			accessToken,
			mailbox,
			[...ids],
		);

		await this.state.settle(row.id, {
			cursor: remaining > 0 ? startHistoryId : finalHistoryId,
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0 || remaining > 0) {
			this.logger.log({
				message: "Gmail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				remaining,
			});
		}

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		options: { maxMessages: number } = {
			maxMessages: GMAIL_SYNC.incremental.maxMessagesPerTick,
		},
	): Promise<{ written: number; remaining: number }> {
		if (ids.length === 0) return { written: 0, remaining: 0 };

		const seen = await this.existingGmailIds(ids);

		const pending = ids.filter((id) => !seen.has(id));
		const batch = pending.slice(0, options.maxMessages);
		const remaining = pending.length - batch.length;

		if (batch.length === 0) return { written: 0, remaining };

		const context: MatchContext = await this.threads.context();

		let written = 0;

		for (const id of batch) {
			const message = await this.gmail.getMessage(accessToken, id);
			if (message.outcome !== "ok") continue;

			const parsed = this.parse(message.data);
			if (!parsed) continue;

			const stored = await this.threads.store(
				row,
				{ mailbox, origin: "gmail" },
				parsed,
				context,
			);
			if (stored) written += 1;
		}

		return { written, remaining };
	}

	private async listBackfillMessages(
		accessToken: string,
		input: GmailBackfillInput,
	): Promise<ListedBackfillMessages> {
		const ids = new Set<string>();
		let pageToken: string | undefined;
		let pagesRead = 0;
		let resultSizeEstimate: number | null = null;

		while (ids.size < input.max) {
			const page = await this.gmail.listMessages(accessToken, {
				after: input.after,
				before: input.before,
				query: input.q,
				pageToken,
				maxResults: Math.min(
					GMAIL_SYNC.backfill.pageSize,
					input.max - ids.size,
				),
			});

			if (page.outcome !== "ok") return page;

			pagesRead += 1;
			resultSizeEstimate = page.data.resultSizeEstimate ?? resultSizeEstimate;

			for (const message of page.data.messages ?? []) {
				if (message.id) ids.add(message.id);
				if (ids.size >= input.max) break;
			}

			pageToken = page.data.nextPageToken;
			if (!pageToken) break;
		}

		return {
			outcome: "ok",
			ids: [...ids],
			pagesRead,
			resultSizeEstimate,
			truncated: Boolean(pageToken),
		};
	}

	private async existingGmailIds(ids: readonly string[]): Promise<Set<string>> {
		if (ids.length === 0) return new Set();

		const alreadyHave = await this.db.emailMessage.findMany({
			where: { gmailMessageId: { in: [...ids] } },
			select: { gmailMessageId: true },
		});

		return new Set(
			alreadyHave
				.map((existing) => existing.gmailMessageId)
				.filter((id): id is string => id !== null),
		);
	}

	private parse(message: GmailMessage): IncomingMessage | null {
		const headers = message.payload?.headers;

		const rawMessageId = header(headers, "message-id");
		if (!rawMessageId) return null;

		const from = parseAddress(header(headers, "from") ?? "");
		if (!from) return null;

		const sentAt = this.sentAt(message, headers);
		if (!sentAt) return null;

		const rootId = rootMessageId(headers) ?? normaliseMessageId(rawMessageId);

		const to = parseAddressList(header(headers, "to")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "to" as const,
		}));

		const cc = parseAddressList(header(headers, "cc")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "cc" as const,
		}));

		const body = stripQuotedHistory(plainTextBody(message.payload));

		return {
			rfcMessageId: normaliseMessageId(rawMessageId),
			rootId,
			subject: header(headers, "subject"),
			from,
			recipients: [...to, ...cc],
			body,
			sentAt,
			gmailMessageId: message.id ?? null,
		};
	}

	private sentAt(
		message: GmailMessage,
		headers: readonly GmailHeader[] | undefined,
	): Date | null {
		if (message.internalDate) {
			const at = new Date(Number(message.internalDate));
			if (!Number.isNaN(at.getTime())) return at;
		}

		const raw = header(headers, "date");
		if (!raw) return null;

		const at = new Date(raw);
		return Number.isNaN(at.getTime()) ? null : at;
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
	): Promise<GmailSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return {
				source: "gmail",
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source: "gmail",
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}

	private backfillBase(input: GmailBackfillInput): GmailBackfillOutcome {
		return {
			source: "gmail",
			userId: input.userId,
			status: "synced",
			dryRun: input.dryRun,
			after: input.after.toISOString(),
			before: input.before.toISOString(),
			max: input.max,
			q: input.q,
		};
	}

	private backfillFailure(
		input: GmailBackfillInput,
		result: MailboxFailure<Profile | MessageList | HistoryList>,
	): GmailBackfillOutcome {
		const base = this.backfillBase(input);

		if (result.outcome === "unauthorized") {
			return { ...base, status: "reconnect", reason: result.reason };
		}

		if (result.outcome === "rate-limited") {
			return { ...base, status: "rate-limited", reason: result.reason };
		}

		return { ...base, status: "failed", reason: result.reason };
	}
}
