import {
	type Db,
	GoogleSyncStatus,
	MailboxHistoricalImportJobStatus,
	type MailboxSyncModel as MailboxSync,
	Prisma as PrismaNamespace,
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
	type GmailMessageRef,
	type HistoryList,
	type MessageList,
	type Profile,
} from "./gmail.client";
import {
	chunkSortIndex,
	type GmailBackfillInput,
	monthRanges,
} from "./gmail-backfill";
import { GmailLabelSyncService } from "./gmail-label-sync.service";
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
	failedMessageId?: string;
};

type GmailBackfillStatus = GmailSyncOutcome["status"] | "retryable-failed";

export type GmailBackfillOutcome = Omit<GmailSyncOutcome, "status"> & {
	status: GmailBackfillStatus;
	dryRun: boolean;
	after: string;
	before: string;
	max: number;
	q?: string;
	messagesMatched?: number;
	messagesAlreadyStored?: number;
	messagesWouldFetch?: number;
	messagesAttempted?: number;
	pagesRead?: number;
	resultSizeEstimate?: number | null;
	truncated?: boolean;
	messagesWritten?: number;
	messagesRemaining?: number;
	messagesIgnored?: number;
	messagesRefreshed?: number;
	ignoredMessageIds?: string[];
	retryAfterMs?: number;
	failedMessageId?: string;
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
	| (MailboxFailure<MessageList> & {
			ids: string[];
			pagesRead: number;
			resultSizeEstimate: number | null;
			truncated: boolean;
	  });

type StrictBackfillIngestOutcome = {
	written: number;
	remaining: number;
	attempted: number;
	ignored: number;
	ignoredIds: string[];
	alreadyStored: number;
	refreshed: number;
	failure?: StrictBackfillFailure;
};

type IncrementalIngestOutcome = {
	written: number;
	remaining: number;
	failure?: StrictBackfillFailure;
};

type LabelChange = {
	added: Set<string>;
	removed: Set<string>;
	threadId: string | null;
};

const HISTORY_TYPES = [
	"messageAdded",
	"messageDeleted",
	"labelAdded",
	"labelRemoved",
] as const;

const ACTIVE_RECONCILE_STATUSES = [
	MailboxHistoricalImportJobStatus.PLANNING,
	MailboxHistoricalImportJobStatus.READY,
	MailboxHistoricalImportJobStatus.RUNNING,
	MailboxHistoricalImportJobStatus.VERIFYING,
	MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT,
	MailboxHistoricalImportJobStatus.WAITING_RETRY,
] as const;

type StrictBackfillFailure = {
	status: Exclude<GmailBackfillStatus, "synced" | "skipped">;
	reason: string;
	retryAfterMs?: number;
	failedMessageId?: string;
};

@Injectable()
export class GmailSyncService {
	private readonly logger = new Logger(GmailSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
		private readonly labels: GmailLabelSyncService,
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

		const outcome = await this.incremental(
			row,
			token.accessToken,
			mailbox,
			row.cursor,
		);

		if (outcome.status === "synced") {
			await this.labels.sync(row, token.accessToken);
		}

		return outcome;
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
			await this.state.markNeedsReconnect(row.id, token.reason);
			return { ...base, status: "reconnect", reason: token.reason };
		}

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.backfillFailure(input, row, profile);
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			return { ...base, status: "failed", reason: "No mailbox address." };
		}

		const listed = await this.listBackfillMessages(token.accessToken, input);
		if (listed.outcome !== "ok") {
			return this.backfillFailure(input, row, listed);
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

		const legacy = await this.legacyMirrorIds(alreadyStored);

		const ingested = await this.strictBackfillIngest(
			row,
			token.accessToken,
			mailbox,
			listed.ids,
			alreadyStored,
			[...legacy],
			input.max,
			input,
		);

		const completeSkipped =
			alreadyStored.size - legacy.size + ingested.alreadyStored;

		this.logger.log({
			message: "Gmail historical backfill",
			userId: row.userId,
			messagesWritten: ingested.written,
			messagesMatched: listed.ids.length,
			messagesAttempted: ingested.attempted,
			messagesRemaining: ingested.remaining,
			messagesIgnored: ingested.ignored,
			messagesRefreshed: ingested.refreshed,
			dryRun: false,
		});

		if (ingested.failure) {
			await this.markBackfillFailure(row, ingested.failure);
			return {
				...base,
				status: ingested.failure.status,
				reason: ingested.failure.reason,
				messagesMatched: listed.ids.length,
				messagesAlreadyStored: completeSkipped,
				messagesAttempted: ingested.attempted,
				messagesWritten: ingested.written,
				messagesRemaining: ingested.remaining,
				messagesIgnored: ingested.ignored,
				messagesRefreshed: ingested.refreshed,
				ignoredMessageIds: ingested.ignoredIds,
				pagesRead: listed.pagesRead,
				resultSizeEstimate: listed.resultSizeEstimate,
				truncated: listed.truncated,
				retryAfterMs: ingested.failure.retryAfterMs,
				failedMessageId: ingested.failure.failedMessageId,
			};
		}

		return {
			...base,
			status: "synced",
			messagesMatched: listed.ids.length,
			messagesAlreadyStored: completeSkipped,
			messagesAttempted: ingested.attempted,
			messagesWritten: ingested.written,
			messagesRemaining: ingested.remaining,
			messagesIgnored: ingested.ignored,
			messagesRefreshed: ingested.refreshed,
			ignoredMessageIds: ingested.ignoredIds,
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
			historyTypes: HISTORY_TYPES,
		});
		let finalHistoryId = startHistoryId;
		const ids = new Set<string>();
		const deletedIds = new Set<string>();
		const labelChanges = new Map<string, LabelChange>();

		while (history.outcome === "ok") {
			for (const entry of history.data.history ?? []) {
				for (const added of entry.messagesAdded ?? []) {
					if (added.message?.id) ids.add(added.message.id);
				}

				for (const deleted of entry.messagesDeleted ?? []) {
					if (deleted.message?.id) deletedIds.add(deleted.message.id);
				}

				for (const change of entry.labelsAdded ?? []) {
					mergeLabelChange(labelChanges, change, "added");
				}

				for (const change of entry.labelsRemoved ?? []) {
					mergeLabelChange(labelChanges, change, "removed");
				}
			}

			finalHistoryId = history.data.historyId ?? finalHistoryId;

			const pageToken = history.data.nextPageToken;
			if (!pageToken) break;

			history = await this.gmail.listHistory(accessToken, {
				startHistoryId,
				pageToken,
				historyTypes: HISTORY_TYPES,
			});
		}

		if (history.outcome === "cursor-invalid") {
			return this.reconcile(row, accessToken, history.reason);
		}

		if (history.outcome !== "ok") {
			return this.handleFailure(row, history);
		}

		for (const id of deletedIds) ids.delete(id);

		const removed = await this.applyDeletions(row.userId, [...deletedIds]);
		const relabelled = await this.applyLabelChanges(labelChanges);

		const { written, remaining, failure } = await this.ingest(
			row,
			accessToken,
			mailbox,
			[...ids],
		);

		if (failure) {
			await this.state.markFailed(row.id, failure.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				messagesWritten: written,
				reason: failure.reason,
				failedMessageId: failure.failedMessageId,
			};
		}

		await this.state.settle(row.id, {
			cursor: remaining > 0 ? startHistoryId : finalHistoryId,
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0 || remaining > 0 || removed > 0 || relabelled > 0) {
			this.logger.log({
				message: "Gmail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				messagesRemoved: removed,
				messagesRelabelled: relabelled,
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

	private async reconcile(
		row: MailboxSync,
		accessToken: string,
		reason: string,
	): Promise<GmailSyncOutcome> {
		await this.state.clearCursor(row.id, reason);

		const profile = await this.gmail.profile(accessToken);
		if (profile.outcome !== "ok") {
			return this.handleFailure(row, profile);
		}

		const jobId = await this.queueFullReconcile(row.userId);

		await this.db.mailboxSync.update({
			where: { id: row.id },
			data: { lastFullReconcileAt: new Date() },
		});

		await this.state.settle(row.id, {
			cursor: profile.data.historyId ?? null,
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message: "Gmail history expired; full reconciliation queued",
			userId: row.userId,
			historicalImportJobId: jobId,
		});

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			reason: "History expired; full reconciliation queued.",
		};
	}

	private async queueFullReconcile(userId: string): Promise<string> {
		const active = await this.db.mailboxHistoricalImportJob.findFirst({
			where: {
				userId,
				source: "gmail",
				status: { in: [...ACTIVE_RECONCILE_STATUSES] },
			},
			select: { id: true },
		});

		if (active) return active.id;

		const after = new Date(GMAIL_SYNC.reconcile.mailboxEpochMs);
		const before = new Date();

		const job = await this.db.mailboxHistoricalImportJob.create({
			data: {
				userId,
				source: "gmail",
				requestedAfter: after,
				requestedBefore: before,
				status: MailboxHistoricalImportJobStatus.PLANNING,
			},
			select: { id: true },
		});

		await this.db.mailboxHistoricalImportChunk.createMany({
			data: monthRanges(after, before).map((range) => ({
				jobId: job.id,
				after: range.after,
				before: range.before,
				sortIndex: chunkSortIndex(range.after),
			})),
		});

		return job.id;
	}

	private async applyDeletions(
		userId: string,
		ids: readonly string[],
	): Promise<number> {
		if (ids.length === 0) return 0;

		let removed = 0;

		for (const batch of chunked(ids, GMAIL_SYNC.reconcile.labelBatchSize)) {
			const rows = await this.db.emailMessage.findMany({
				where: { gmailMessageId: { in: batch } },
				select: { id: true, threadId: true },
			});

			if (rows.length === 0) continue;

			await this.db.emailMessage.deleteMany({
				where: { id: { in: rows.map((message) => message.id) } },
			});

			removed += rows.length;

			const threadIds = [...new Set(rows.map((message) => message.threadId))];
			for (const threadId of threadIds) {
				const stats = await this.db.emailMessage.aggregate({
					where: { threadId },
					_count: { _all: true },
					_min: { sentAt: true },
					_max: { sentAt: true },
				});

				const data: PrismaNamespace.EmailThreadUncheckedUpdateInput = {
					messageCount: stats._count._all,
				};
				if (stats._min.sentAt) data.firstMessageAt = stats._min.sentAt;
				if (stats._max.sentAt) data.lastMessageAt = stats._max.sentAt;

				await this.db.emailThread.update({
					where: { id: threadId },
					data,
				});
			}
		}

		if (removed > 0) {
			this.logger.log({
				message: "Gmail deletions applied",
				userId,
				messagesRemoved: removed,
			});
		}

		return removed;
	}

	private async applyLabelChanges(
		changes: ReadonlyMap<string, LabelChange>,
	): Promise<number> {
		if (changes.size === 0) return 0;

		let relabelled = 0;

		for (const batch of chunked(
			[...changes.keys()],
			GMAIL_SYNC.reconcile.labelBatchSize,
		)) {
			const rows = await this.db.emailMessage.findMany({
				where: { gmailMessageId: { in: batch } },
				select: {
					id: true,
					gmailMessageId: true,
					gmailThreadId: true,
					labelIds: true,
				},
			});

			for (const message of rows) {
				if (!message.gmailMessageId) continue;

				const change = changes.get(message.gmailMessageId);
				if (!change) continue;

				const next = new Set(message.labelIds);
				for (const labelId of change.added) next.add(labelId);
				for (const labelId of change.removed) next.delete(labelId);

				const updated = [...next];
				const labelsChanged = !sameMembers(message.labelIds, updated);
				const threadMissing =
					message.gmailThreadId === null && change.threadId !== null;

				if (!labelsChanged && !threadMissing) continue;

				const data: PrismaNamespace.EmailMessageUncheckedUpdateInput = {};
				if (labelsChanged) data.labelIds = updated;
				if (threadMissing) data.gmailThreadId = change.threadId;

				await this.db.emailMessage.update({
					where: { id: message.id },
					data,
				});
				relabelled += 1;
			}
		}

		return relabelled;
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		options: { maxMessages: number } = {
			maxMessages: GMAIL_SYNC.incremental.maxMessagesPerTick,
		},
	): Promise<IncrementalIngestOutcome> {
		if (ids.length === 0) return { written: 0, remaining: 0 };

		const seen = await this.existingGmailIds(ids);

		const pending = ids.filter((id) => !seen.has(id));
		const batch = pending.slice(0, options.maxMessages);
		const remaining = pending.length - batch.length;

		if (batch.length === 0) return { written: 0, remaining };

		const context: MatchContext = await this.threads.context();

		let written = 0;
		let processed = 0;

		for (const id of batch) {
			const message = await this.gmail.getMessage(accessToken, id);
			if (message.outcome !== "ok") {
				processed += 1;
				continue;
			}

			const parsed = this.parse(message.data);
			if (!parsed) {
				processed += 1;
				continue;
			}

			let stored: boolean;
			try {
				stored = await this.threads.store(
					row,
					{ mailbox, origin: "gmail" },
					parsed,
					context,
				);
			} catch (error) {
				return {
					written,
					remaining: pending.length - processed,
					failure: this.persistenceFailureForMessage(error, row, message.data),
				};
			}
			if (stored) written += 1;
			processed += 1;
		}

		return { written, remaining: pending.length - processed };
	}

	private async strictBackfillIngest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		alreadyStored: ReadonlySet<string>,
		refreshIds: readonly string[],
		maxMessages: number,
		input: GmailBackfillInput,
	): Promise<StrictBackfillIngestOutcome> {
		if (ids.length === 0 && refreshIds.length === 0) {
			return {
				written: 0,
				remaining: 0,
				attempted: 0,
				ignored: 0,
				ignoredIds: [],
				alreadyStored: 0,
				refreshed: 0,
			};
		}

		const pending = ids.filter((id) => !alreadyStored.has(id));
		const batch = pending.slice(0, maxMessages);
		const refreshBatch = refreshIds.slice(
			0,
			Math.max(0, maxMessages - batch.length),
		);
		const context: MatchContext = await this.threads.context();

		let written = 0;
		let attempted = 0;
		let ignored = 0;
		const ignoredIds: string[] = [];
		let storedElsewhere = 0;

		for (const id of batch) {
			attempted += 1;
			const message = await this.gmail.getMessage(accessToken, id);

			if (message.outcome !== "ok") {
				return {
					written,
					attempted,
					ignored,
					ignoredIds,
					alreadyStored: storedElsewhere,
					refreshed: 0,
					remaining:
						pending.length -
						written -
						ignored -
						storedElsewhere +
						refreshIds.length,
					failure: backfillFailureForMessage(id, message),
				};
			}

			const parsed = this.parse(message.data);
			if (!parsed) {
				ignored += 1;
				ignoredIds.push(id);
				continue;
			}

			let stored: boolean;
			try {
				stored = await this.threads.store(
					row,
					{ mailbox, origin: "gmail" },
					parsed,
					context,
				);
			} catch (error) {
				return {
					written,
					attempted,
					ignored,
					ignoredIds,
					alreadyStored: storedElsewhere,
					refreshed: 0,
					remaining:
						pending.length -
						written -
						ignored -
						storedElsewhere +
						refreshIds.length,
					failure: this.persistenceFailureForMessage(
						error,
						row,
						message.data,
						input,
					),
				};
			}
			if (stored) {
				written += 1;
			} else {
				storedElsewhere += 1;
			}
		}

		let refreshProcessed = 0;
		let refreshed = 0;

		for (const id of refreshBatch) {
			const metadata = await this.gmail.getMessageMetadata(accessToken, id);

			if (metadata.outcome !== "ok") {
				return {
					written,
					attempted,
					ignored,
					ignoredIds,
					alreadyStored: storedElsewhere,
					refreshed,
					remaining:
						pending.length -
						written -
						ignored -
						storedElsewhere +
						(refreshIds.length - refreshProcessed),
					failure: backfillFailureForMessage(id, metadata),
				};
			}

			refreshProcessed += 1;
			if (await this.refreshMirrorMetadata(id, metadata.data)) {
				refreshed += 1;
			}
		}

		return {
			written,
			attempted,
			ignored,
			ignoredIds,
			alreadyStored: storedElsewhere,
			refreshed,
			remaining:
				pending.length -
				written -
				ignored -
				storedElsewhere +
				(refreshIds.length - refreshProcessed),
		};
	}

	private async legacyMirrorIds(
		ids: ReadonlySet<string>,
	): Promise<Set<string>> {
		if (ids.size === 0) return new Set();

		const legacy = await this.db.emailMessage.findMany({
			where: {
				gmailMessageId: { in: [...ids] },
				gmailThreadId: null,
			},
			select: { gmailMessageId: true },
		});

		return new Set(
			legacy
				.map((existing) => existing.gmailMessageId)
				.filter((id): id is string => id !== null),
		);
	}

	private async refreshMirrorMetadata(
		gmailMessageId: string,
		metadata: GmailMessage,
	): Promise<boolean> {
		const threadId = metadata.threadId ?? null;
		const labelIds = metadata.labelIds ?? [];
		if (threadId === null && labelIds.length === 0) return false;

		const updated = await this.db.emailMessage.updateMany({
			where: { gmailMessageId, gmailThreadId: null },
			data: { gmailThreadId: threadId, labelIds },
		});

		return updated.count > 0;
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
				mirror: true,
				includeSpamTrash: true,
			});

			if (page.outcome !== "ok") {
				return {
					...page,
					ids: [...ids],
					pagesRead,
					resultSizeEstimate,
					truncated: true,
				};
			}

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
			gmailThreadId: message.threadId ?? null,
			labelIds: message.labelIds ?? [],
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

	private async backfillFailure(
		input: GmailBackfillInput,
		row: MailboxSync,
		result:
			| MailboxFailure<Profile | HistoryList>
			| (MailboxFailure<MessageList> & {
					ids?: string[];
					pagesRead?: number;
					resultSizeEstimate?: number | null;
					truncated?: boolean;
			  }),
	): Promise<GmailBackfillOutcome> {
		const base = this.backfillBase(input);
		const partial = {
			messagesMatched: "ids" in result ? (result.ids?.length ?? 0) : 0,
			pagesRead: "pagesRead" in result ? (result.pagesRead ?? 0) : 0,
			resultSizeEstimate:
				"resultSizeEstimate" in result ? result.resultSizeEstimate : undefined,
			truncated: "truncated" in result ? (result.truncated ?? false) : false,
		};

		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				...base,
				...partial,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs);
			return {
				...base,
				...partial,
				status: "rate-limited",
				reason: result.reason,
				retryAfterMs: result.retryAfterMs,
			};
		}

		if (result.outcome === "cursor-invalid") {
			await this.state.markFailed(row.id, result.reason);
			return { ...base, ...partial, status: "failed", reason: result.reason };
		}

		const status = result.retryable ? "retryable-failed" : "failed";
		await this.state.markFailed(row.id, result.reason);
		return { ...base, ...partial, status, reason: result.reason };
	}

	private async markBackfillFailure(
		row: MailboxSync,
		failure: StrictBackfillFailure,
	): Promise<void> {
		if (failure.status === "reconnect") {
			await this.state.markNeedsReconnect(row.id, failure.reason);
			return;
		}

		if (failure.status === "rate-limited") {
			await this.state.markRateLimited(row.id, failure.retryAfterMs ?? 60_000);
			return;
		}

		await this.state.markFailed(row.id, failure.reason);
	}

	private persistenceFailureForMessage(
		cause: unknown,
		row: MailboxSync,
		message: GmailMessage,
		input?: GmailBackfillInput,
	): StrictBackfillFailure {
		const category = persistenceFailureCategory(cause);

		this.logger.error(
			{
				message: "Gmail message persistence failed",
				userId: row.userId,
				gmailMessageId: message.id ?? null,
				gmailThreadId: message.threadId ?? null,
				historicalImportJobId: input?.historicalImportJobId,
				historicalImportChunkId: input?.historicalImportChunkId,
				chunkAfter: input?.after.toISOString(),
				chunkBefore: input?.before.toISOString(),
				failureCategory: category,
			},
			stackOf(cause),
		);

		return {
			status: retryablePersistenceFailure(cause)
				? "retryable-failed"
				: "failed",
			reason: `Gmail message persistence failed (${category}).`,
			failedMessageId: message.id ?? undefined,
		};
	}
}

function mergeLabelChange(
	changes: Map<string, LabelChange>,
	record: GmailMessageRef,
	kind: "added" | "removed",
): void {
	const id = record.message?.id;
	if (!id) return;

	const change = changes.get(id) ?? {
		added: new Set(),
		removed: new Set(),
		threadId: record.message?.threadId ?? null,
	};
	for (const labelId of record.labelIds ?? []) {
		change[kind].add(labelId);
	}
	changes.set(id, change);
}

function chunked<T>(values: readonly T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		batches.push(values.slice(index, index + size));
	}
	return batches;
}

function sameMembers(
	current: readonly string[],
	next: readonly string[],
): boolean {
	if (current.length !== next.length) return false;
	const set = new Set(current);
	return next.every((value) => set.has(value));
}

function backfillFailureForMessage(
	id: string,
	result: MailboxFailure<GmailMessage>,
): StrictBackfillFailure {
	if (result.outcome === "unauthorized") {
		return {
			status: "reconnect",
			reason: result.reason,
			failedMessageId: id,
		};
	}

	if (result.outcome === "rate-limited") {
		return {
			status: "rate-limited",
			reason: result.reason,
			retryAfterMs: result.retryAfterMs,
			failedMessageId: id,
		};
	}

	if (result.outcome === "cursor-invalid") {
		return {
			status: "failed",
			reason: result.reason,
			failedMessageId: id,
		};
	}

	return {
		status: result.retryable ? "retryable-failed" : "failed",
		reason: result.reason,
		failedMessageId: id,
	};
}

function persistenceFailureCategory(cause: unknown): string {
	if (cause instanceof PrismaNamespace.PrismaClientKnownRequestError) {
		return `prisma-${cause.code.toLowerCase()}`;
	}

	const message = cause instanceof Error ? cause.message : String(cause);
	const lower = message.toLowerCase();
	if (lower.includes("22021") || lower.includes("invalid byte sequence")) {
		return "postgres-invalid-text-encoding";
	}

	if (lower.includes("nul") || lower.includes("\\u0000")) {
		return "postgres-invalid-text-encoding";
	}

	const name = cause instanceof Error && cause.name ? cause.name : "unknown";
	return name.replace(/[^a-z0-9_.-]+/gi, "-").toLowerCase();
}

function retryablePersistenceFailure(cause: unknown): boolean {
	if (!(cause instanceof PrismaNamespace.PrismaClientKnownRequestError)) {
		return false;
	}

	return ["P1001", "P1002", "P1008", "P2024", "P2034"].includes(cause.code);
}

function stackOf(cause: unknown): string {
	if (cause instanceof Error) return cause.stack ?? cause.message;
	return String(cause);
}
