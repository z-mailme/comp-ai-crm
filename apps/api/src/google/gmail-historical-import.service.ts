import {
	type Db,
	type MailboxHistoricalImportChunkModel,
	MailboxHistoricalImportChunkStatus,
	type MailboxHistoricalImportJobModel,
	MailboxHistoricalImportJobStatus,
	MailboxHistoricalImportVerificationStatus,
	Prisma,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { GMAIL_SYNC } from "./gmail-sync.config";
import {
	type GmailBackfillOutcome,
	GmailSyncService,
} from "./gmail-sync.service";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const ACTIVE_JOB_STATUSES = [
	MailboxHistoricalImportJobStatus.PLANNING,
	MailboxHistoricalImportJobStatus.READY,
	MailboxHistoricalImportJobStatus.RUNNING,
	MailboxHistoricalImportJobStatus.VERIFYING,
	MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT,
	MailboxHistoricalImportJobStatus.WAITING_RETRY,
] as const;

const TERMINAL_JOB_STATUSES = [
	MailboxHistoricalImportJobStatus.COMPLETED,
	MailboxHistoricalImportJobStatus.CANCELLED,
] as const;

const DUE_CHUNK_STATUSES = [
	MailboxHistoricalImportChunkStatus.PENDING,
	MailboxHistoricalImportChunkStatus.WAITING_RATE_LIMIT,
	MailboxHistoricalImportChunkStatus.RETRYABLE_FAILED,
] as const;

type SerializedChunk = {
	id: string;
	after: string;
	before: string;
	status: MailboxHistoricalImportChunkStatus;
	messagesMatched: number | null;
	messagesAlreadyStored: number;
	messagesAttempted: number;
	messagesWritten: number;
	messagesIgnored: number;
	messagesRemaining: number;
	retryAfterAt: string | null;
	attemptCount: number;
	lastError: string | null;
	failedMessageId: string | null;
	verifiedAt: string | null;
	verificationStatus: MailboxHistoricalImportVerificationStatus;
};

export type HistoricalImportJobOutput = {
	id: string;
	userId: string;
	source: "gmail";
	requestedAfter: string;
	requestedBefore: string;
	status: MailboxHistoricalImportJobStatus;
	totalMessages: number;
	processedMessages: number;
	writtenMessages: number;
	alreadyStoredMessages: number;
	ignoredMessages: number;
	remainingMessages: number;
	totalChunks: number;
	completedChunks: number;
	progressPercentage: number;
	currentChunk: SerializedChunk | null;
	retryAfterAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
	verifiedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
};

export type HistoricalImportTickOutput = {
	attempted: number;
	planned: number;
	processed: number;
	verified: number;
	waiting: number;
	failed: number;
	completed: number;
	jobId: string | null;
};

type JobWithChunks = MailboxHistoricalImportJobModel & {
	chunks: MailboxHistoricalImportChunkModel[];
};

@Injectable()
export class GmailHistoricalImportService {
	private readonly logger = new Logger(GmailHistoricalImportService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailSyncService,
	) {}

	async create(
		userId: string,
		input: { requestedAfter: Date; requestedBefore: Date },
	): Promise<HistoricalImportJobOutput> {
		if (input.requestedAfter >= input.requestedBefore) {
			throw new BadRequestException(
				"The start date must be before the end date.",
			);
		}

		const ranges = monthRanges(input.requestedAfter, input.requestedBefore);

		const job = await this.db.$transaction(
			async (tx) => {
				const existing = await tx.mailboxHistoricalImportJob.findFirst({
					where: {
						userId,
						source: "gmail",
						requestedAfter: input.requestedAfter,
						requestedBefore: input.requestedBefore,
						status: { in: [...ACTIVE_JOB_STATUSES] },
					},
				});

				if (existing) return existing;

				const created = await tx.mailboxHistoricalImportJob.create({
					data: {
						userId,
						source: "gmail",
						requestedAfter: input.requestedAfter,
						requestedBefore: input.requestedBefore,
						status: MailboxHistoricalImportJobStatus.PLANNING,
					},
				});

				await tx.mailboxHistoricalImportChunk.createMany({
					data: ranges.map((range) => ({
						jobId: created.id,
						after: range.after,
						before: range.before,
						sortIndex: sortIndex(range.after),
					})),
				});

				return created;
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
		);

		await this.refreshProgress(job.id);
		return this.byId(userId, job.id);
	}

	async list(userId: string): Promise<HistoricalImportJobOutput[]> {
		const jobs = await this.db.mailboxHistoricalImportJob.findMany({
			where: { userId, source: "gmail" },
			include: { chunks: { orderBy: [{ after: "asc" }, { before: "asc" }] } },
			orderBy: { createdAt: "desc" },
			take: 10,
		});

		return jobs.map((job) => serializeJob(job));
	}

	async latest(userId: string): Promise<HistoricalImportJobOutput | null> {
		const activeJob = await this.db.mailboxHistoricalImportJob.findFirst({
			where: {
				userId,
				source: "gmail",
				status: { notIn: [...TERMINAL_JOB_STATUSES] },
			},
			include: { chunks: { orderBy: [{ after: "asc" }, { before: "asc" }] } },
			orderBy: { updatedAt: "desc" },
		});

		if (activeJob) return serializeJob(activeJob);

		const job = await this.db.mailboxHistoricalImportJob.findFirst({
			where: { userId, source: "gmail" },
			include: { chunks: { orderBy: [{ after: "asc" }, { before: "asc" }] } },
			orderBy: { createdAt: "desc" },
		});

		return job ? serializeJob(job) : null;
	}

	async byId(userId: string, id: string): Promise<HistoricalImportJobOutput> {
		const job = await this.db.mailboxHistoricalImportJob.findFirst({
			where: { id, userId, source: "gmail" },
			include: { chunks: { orderBy: [{ after: "asc" }, { before: "asc" }] } },
		});

		if (!job) throw new NotFoundException("Historical Gmail import not found.");
		return serializeJob(job);
	}

	async pause(userId: string, id: string): Promise<HistoricalImportJobOutput> {
		await this.db.mailboxHistoricalImportJob.updateMany({
			where: {
				id,
				userId,
				source: "gmail",
				status: { notIn: [...TERMINAL_JOB_STATUSES] },
			},
			data: {
				status: MailboxHistoricalImportJobStatus.PAUSED,
				leaseExpiresAt: null,
			},
		});

		return this.byId(userId, id);
	}

	async resume(userId: string, id: string): Promise<HistoricalImportJobOutput> {
		const job = await this.db.mailboxHistoricalImportJob.findFirst({
			where: { id, userId, source: "gmail" },
			include: { chunks: true },
		});

		if (!job) throw new NotFoundException("Historical Gmail import not found.");
		if (job.status === MailboxHistoricalImportJobStatus.CANCELLED) {
			throw new BadRequestException("A cancelled Gmail import cannot resume.");
		}
		if (job.status === MailboxHistoricalImportJobStatus.COMPLETED) {
			return serializeJob(job);
		}

		const nextStatus = job.chunks.some(
			(chunk) => chunk.messagesMatched === null,
		)
			? MailboxHistoricalImportJobStatus.PLANNING
			: MailboxHistoricalImportJobStatus.READY;

		await this.db.$transaction([
			this.db.mailboxHistoricalImportChunk.updateMany({
				where: {
					jobId: id,
					status: {
						in: [
							MailboxHistoricalImportChunkStatus.RECONNECT_REQUIRED,
							MailboxHistoricalImportChunkStatus.FAILED,
						],
					},
				},
				data: {
					status: MailboxHistoricalImportChunkStatus.PENDING,
					retryAfterAt: null,
					attemptCount: 0,
					lastError: null,
					failedMessageId: null,
				},
			}),
			this.db.mailboxHistoricalImportJob.update({
				where: { id },
				data: {
					status: nextStatus,
					retryAfterAt: null,
					leaseExpiresAt: null,
					lastError: null,
					completedAt: null,
				},
			}),
		]);

		await this.refreshProgress(id);
		return this.byId(userId, id);
	}

	async cancel(userId: string, id: string): Promise<HistoricalImportJobOutput> {
		await this.db.mailboxHistoricalImportJob.updateMany({
			where: {
				id,
				userId,
				source: "gmail",
				status: { not: MailboxHistoricalImportJobStatus.COMPLETED },
			},
			data: {
				status: MailboxHistoricalImportJobStatus.CANCELLED,
				leaseExpiresAt: null,
				completedAt: new Date(),
			},
		});

		return this.byId(userId, id);
	}

	async tick(now: Date = new Date()): Promise<HistoricalImportTickOutput> {
		const job = await this.claimDueJob(now);
		if (!job) return emptyTick();

		const summary = emptyTick(job.id);
		summary.attempted = 1;

		try {
			const ran = await this.runClaimedJob(job.id, now);
			Object.assign(summary, ran, { attempted: 1, jobId: job.id });
		} catch (error) {
			summary.failed = 1;
			await this.db.mailboxHistoricalImportJob.update({
				where: { id: job.id },
				data: {
					status: MailboxHistoricalImportJobStatus.FAILED,
					lastError: error instanceof Error ? error.message : String(error),
					leaseExpiresAt: null,
				},
			});
			this.logger.error(
				{ message: "Historical Gmail import tick failed", jobId: job.id },
				error instanceof Error ? error.stack : String(error),
			);
		} finally {
			await this.releaseJob(job.id);
		}

		return summary;
	}

	private async runClaimedJob(
		jobId: string,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		await this.db.mailboxHistoricalImportJob.updateMany({
			where: { id: jobId, startedAt: null },
			data: { startedAt: now },
		});

		const job = await this.loadJob(jobId);
		if (!job) return emptyTick(jobId);

		if (
			job.status === MailboxHistoricalImportJobStatus.PAUSED ||
			job.status === MailboxHistoricalImportJobStatus.RECONNECT_REQUIRED ||
			job.status === MailboxHistoricalImportJobStatus.CANCELLED ||
			job.status === MailboxHistoricalImportJobStatus.COMPLETED
		) {
			return emptyTick(jobId);
		}

		const planningChunk = await this.nextPlanningChunk(jobId, now);
		if (planningChunk) {
			const planned = await this.planChunk(job, planningChunk, now);
			await this.refreshProgress(jobId);
			return planned;
		}

		const verifyChunk = await this.nextVerificationChunk(jobId, now);
		if (verifyChunk) {
			const verified = await this.verifyChunk(job, verifyChunk, now);
			await this.refreshProgress(jobId);
			return verified;
		}

		const workChunk = await this.nextWorkChunk(jobId, now);
		if (workChunk) {
			const processed = await this.processChunk(job, workChunk, now);
			await this.refreshProgress(jobId);
			return processed;
		}

		await this.refreshProgress(jobId);
		return emptyTick(jobId);
	}

	private async planChunk(
		job: MailboxHistoricalImportJobModel,
		chunk: MailboxHistoricalImportChunkModel,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		await this.markChunkRunning(job.id, chunk.id, now);

		const outcome = await this.gmail.backfill({
			userId: job.userId,
			after: chunk.after,
			before: chunk.before,
			dryRun: true,
			max: GMAIL_SYNC.historicalImport.safeCandidateLimit,
		});

		if (outcome.status === "synced") {
			if (outcome.truncated) {
				await this.splitChunk(chunk);
			} else {
				await this.db.mailboxHistoricalImportChunk.update({
					where: { id: chunk.id },
					data: {
						status: MailboxHistoricalImportChunkStatus.PENDING,
						messagesMatched: outcome.messagesMatched ?? 0,
						messagesAlreadyStored: outcome.messagesAlreadyStored ?? 0,
						messagesRemaining: outcome.messagesWouldFetch ?? 0,
						attemptCount: 0,
						retryAfterAt: null,
						lastError: null,
						failedMessageId: null,
					},
				});
			}

			return { ...emptyTick(job.id), planned: 1 };
		}

		return this.handleChunkOutcome(job.id, chunk, outcome, now);
	}

	private async processChunk(
		job: MailboxHistoricalImportJobModel,
		chunk: MailboxHistoricalImportChunkModel,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		await this.markChunkRunning(job.id, chunk.id, now);

		const outcome = await this.gmail.backfill({
			userId: job.userId,
			after: chunk.after,
			before: chunk.before,
			dryRun: false,
			max: GMAIL_SYNC.historicalImport.safeCandidateLimit,
		});

		if (outcome.status === "synced") {
			const written = chunk.messagesWritten + (outcome.messagesWritten ?? 0);
			const ignoredIds = unique([
				...chunk.ignoredMessageIds,
				...(outcome.ignoredMessageIds ?? []),
			]);
			const matched = Math.max(
				chunk.messagesMatched ?? 0,
				outcome.messagesMatched ?? 0,
			);
			const remaining = outcome.messagesRemaining ?? 0;
			const alreadyStored = Math.max(
				0,
				matched - written - ignoredIds.length - remaining,
			);
			const completed =
				!outcome.truncated && remaining === 0
					? MailboxHistoricalImportChunkStatus.COMPLETED
					: MailboxHistoricalImportChunkStatus.PENDING;

			await this.db.mailboxHistoricalImportChunk.update({
				where: { id: chunk.id },
				data: {
					status: completed,
					messagesMatched: outcome.truncated ? null : matched,
					messagesAlreadyStored: alreadyStored,
					messagesAttempted:
						chunk.messagesAttempted + (outcome.messagesAttempted ?? 0),
					messagesWritten: written,
					messagesIgnored: ignoredIds.length,
					messagesRemaining: remaining,
					ignoredMessageIds: ignoredIds,
					attemptCount: 0,
					retryAfterAt: null,
					lastError: null,
					failedMessageId: null,
					completedAt:
						completed === MailboxHistoricalImportChunkStatus.COMPLETED
							? now
							: null,
					verificationStatus:
						completed === MailboxHistoricalImportChunkStatus.COMPLETED
							? MailboxHistoricalImportVerificationStatus.UNVERIFIED
							: chunk.verificationStatus,
				},
			});

			return { ...emptyTick(job.id), processed: 1 };
		}

		return this.handleChunkOutcome(job.id, chunk, outcome, now);
	}

	private async verifyChunk(
		job: MailboxHistoricalImportJobModel,
		chunk: MailboxHistoricalImportChunkModel,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		await this.db.mailboxHistoricalImportJob.update({
			where: { id: job.id },
			data: {
				status: MailboxHistoricalImportJobStatus.RUNNING,
				currentChunkId: chunk.id,
				retryAfterAt: null,
			},
		});

		const outcome = await this.gmail.backfill({
			userId: job.userId,
			after: chunk.after,
			before: chunk.before,
			dryRun: true,
			max: GMAIL_SYNC.historicalImport.safeCandidateLimit,
		});

		if (outcome.status === "synced") {
			const wouldFetch = outcome.messagesWouldFetch ?? 0;
			const ignored = chunk.ignoredMessageIds.length;

			if (!outcome.truncated && wouldFetch <= ignored) {
				await this.db.mailboxHistoricalImportChunk.update({
					where: { id: chunk.id },
					data: {
						verificationStatus:
							MailboxHistoricalImportVerificationStatus.VERIFIED,
						verificationError: null,
						verifiedAt: now,
						retryAfterAt: null,
					},
				});
			} else {
				await this.db.mailboxHistoricalImportChunk.update({
					where: { id: chunk.id },
					data: {
						status: MailboxHistoricalImportChunkStatus.PENDING,
						messagesMatched: Math.max(
							chunk.messagesMatched ?? 0,
							outcome.messagesMatched ?? 0,
						),
						verificationStatus:
							MailboxHistoricalImportVerificationStatus.MISSING,
						verificationError: "Verification found messages still missing.",
						messagesRemaining: Math.max(0, wouldFetch - ignored),
						completedAt: null,
					},
				});
			}

			return { ...emptyTick(job.id), verified: 1 };
		}

		return this.handleVerificationOutcome(job.id, chunk, outcome, now);
	}

	private async handleChunkOutcome(
		jobId: string,
		chunk: MailboxHistoricalImportChunkModel,
		outcome: GmailBackfillOutcome,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		if (outcome.status === "rate-limited") {
			const retryAfterAt = addMs(
				now,
				(outcome.retryAfterMs ??
					GMAIL_SYNC.historicalImport.defaultRateLimitMs) +
					GMAIL_SYNC.historicalImport.rateLimitBufferMs,
			);
			await this.setWaitingRateLimit(jobId, chunk.id, retryAfterAt, outcome);
			return { ...emptyTick(jobId), waiting: 1 };
		}

		if (outcome.status === "retryable-failed") {
			return this.scheduleRetry(jobId, chunk, outcome, now);
		}

		if (outcome.status === "reconnect") {
			await this.db.$transaction([
				this.db.mailboxHistoricalImportChunk.update({
					where: { id: chunk.id },
					data: {
						status: MailboxHistoricalImportChunkStatus.RECONNECT_REQUIRED,
						lastError: outcome.reason ?? "Google needs reconnecting.",
						failedMessageId: outcome.failedMessageId ?? null,
						retryAfterAt: null,
					},
				}),
				this.db.mailboxHistoricalImportJob.update({
					where: { id: jobId },
					data: {
						status: MailboxHistoricalImportJobStatus.RECONNECT_REQUIRED,
						lastError: outcome.reason ?? "Google needs reconnecting.",
						retryAfterAt: null,
					},
				}),
			]);

			return { ...emptyTick(jobId), failed: 1 };
		}

		await this.failChunk(
			jobId,
			chunk.id,
			outcome.reason ?? "Gmail import failed.",
		);
		return { ...emptyTick(jobId), failed: 1 };
	}

	private async handleVerificationOutcome(
		jobId: string,
		chunk: MailboxHistoricalImportChunkModel,
		outcome: GmailBackfillOutcome,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		if (outcome.status === "rate-limited") {
			const retryAfterAt = addMs(
				now,
				(outcome.retryAfterMs ??
					GMAIL_SYNC.historicalImport.defaultRateLimitMs) +
					GMAIL_SYNC.historicalImport.rateLimitBufferMs,
			);
			await this.db.$transaction([
				this.db.mailboxHistoricalImportChunk.update({
					where: { id: chunk.id },
					data: {
						retryAfterAt,
						verificationError: outcome.reason ?? "Gmail rate-limited.",
					},
				}),
				this.db.mailboxHistoricalImportJob.update({
					where: { id: jobId },
					data: {
						status: MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT,
						retryAfterAt,
						lastError: outcome.reason ?? "Gmail rate-limited.",
					},
				}),
			]);

			return { ...emptyTick(jobId), waiting: 1 };
		}

		if (outcome.status === "retryable-failed") {
			return this.scheduleRetry(jobId, chunk, outcome, now);
		}

		if (outcome.status === "reconnect") {
			await this.db.mailboxHistoricalImportJob.update({
				where: { id: jobId },
				data: {
					status: MailboxHistoricalImportJobStatus.RECONNECT_REQUIRED,
					lastError: outcome.reason ?? "Google needs reconnecting.",
				},
			});
			return { ...emptyTick(jobId), failed: 1 };
		}

		await this.failChunk(
			jobId,
			chunk.id,
			outcome.reason ?? "Verification failed.",
		);
		return { ...emptyTick(jobId), failed: 1 };
	}

	private async scheduleRetry(
		jobId: string,
		chunk: MailboxHistoricalImportChunkModel,
		outcome: GmailBackfillOutcome,
		now: Date,
	): Promise<HistoricalImportTickOutput> {
		const attemptCount = chunk.attemptCount + 1;
		const reason = outcome.reason ?? "Gmail returned a retryable failure.";

		if (attemptCount > GMAIL_SYNC.historicalImport.maxRetryAttempts) {
			await this.failChunk(jobId, chunk.id, reason, outcome.failedMessageId);
			return { ...emptyTick(jobId), failed: 1 };
		}

		const retryAfterAt = addMs(
			now,
			GMAIL_SYNC.historicalImport.retryBackoffMs[
				Math.min(
					attemptCount - 1,
					GMAIL_SYNC.historicalImport.retryBackoffMs.length - 1,
				)
			] ?? lastBackoffMs(),
		);

		await this.db.$transaction([
			this.db.mailboxHistoricalImportChunk.update({
				where: { id: chunk.id },
				data: {
					status: MailboxHistoricalImportChunkStatus.RETRYABLE_FAILED,
					attemptCount,
					retryAfterAt,
					lastError: reason,
					failedMessageId: outcome.failedMessageId ?? null,
				},
			}),
			this.db.mailboxHistoricalImportJob.update({
				where: { id: jobId },
				data: {
					status: MailboxHistoricalImportJobStatus.WAITING_RETRY,
					retryAfterAt,
					lastError: reason,
				},
			}),
		]);

		return { ...emptyTick(jobId), waiting: 1 };
	}

	private async setWaitingRateLimit(
		jobId: string,
		chunkId: string,
		retryAfterAt: Date,
		outcome: GmailBackfillOutcome,
	): Promise<void> {
		const reason = outcome.reason ?? "Gmail rate-limited.";

		await this.db.$transaction([
			this.db.mailboxHistoricalImportChunk.update({
				where: { id: chunkId },
				data: {
					status: MailboxHistoricalImportChunkStatus.WAITING_RATE_LIMIT,
					retryAfterAt,
					lastError: reason,
					failedMessageId: outcome.failedMessageId ?? null,
				},
			}),
			this.db.mailboxHistoricalImportJob.update({
				where: { id: jobId },
				data: {
					status: MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT,
					retryAfterAt,
					lastError: reason,
				},
			}),
		]);
	}

	private async failChunk(
		jobId: string,
		chunkId: string,
		reason: string,
		failedMessageId?: string,
	): Promise<void> {
		await this.db.$transaction([
			this.db.mailboxHistoricalImportChunk.update({
				where: { id: chunkId },
				data: {
					status: MailboxHistoricalImportChunkStatus.FAILED,
					lastError: reason,
					failedMessageId: failedMessageId ?? null,
					retryAfterAt: null,
				},
			}),
			this.db.mailboxHistoricalImportJob.update({
				where: { id: jobId },
				data: {
					status: MailboxHistoricalImportJobStatus.FAILED,
					lastError: reason,
					retryAfterAt: null,
				},
			}),
		]);
	}

	private async splitChunk(
		chunk: MailboxHistoricalImportChunkModel,
	): Promise<void> {
		const ranges = splitRange(chunk.after, chunk.before);
		if (ranges.length < 2) {
			await this.failChunk(
				chunk.jobId,
				chunk.id,
				"Gmail returned too many messages for the smallest safe import range.",
			);
			return;
		}

		await this.db.$transaction(async (tx) => {
			await tx.mailboxHistoricalImportChunk.delete({ where: { id: chunk.id } });
			await tx.mailboxHistoricalImportChunk.createMany({
				data: ranges.map((range) => ({
					jobId: chunk.jobId,
					after: range.after,
					before: range.before,
					sortIndex: sortIndex(range.after),
					depth: chunk.depth + 1,
				})),
			});
		});
	}

	private async nextPlanningChunk(
		jobId: string,
		now: Date,
	): Promise<MailboxHistoricalImportChunkModel | null> {
		return this.db.mailboxHistoricalImportChunk.findFirst({
			where: {
				jobId,
				messagesMatched: null,
				status: { in: [...DUE_CHUNK_STATUSES] },
				OR: [{ retryAfterAt: null }, { retryAfterAt: { lte: now } }],
			},
			orderBy: [{ after: "asc" }, { before: "asc" }],
		});
	}

	private async nextWorkChunk(
		jobId: string,
		now: Date,
	): Promise<MailboxHistoricalImportChunkModel | null> {
		return this.db.mailboxHistoricalImportChunk.findFirst({
			where: {
				jobId,
				messagesMatched: { not: null },
				status: { in: [...DUE_CHUNK_STATUSES] },
				OR: [{ retryAfterAt: null }, { retryAfterAt: { lte: now } }],
			},
			orderBy: [{ after: "asc" }, { before: "asc" }],
		});
	}

	private async nextVerificationChunk(
		jobId: string,
		now: Date,
	): Promise<MailboxHistoricalImportChunkModel | null> {
		const pendingWork = await this.db.mailboxHistoricalImportChunk.count({
			where: {
				jobId,
				OR: [
					{ messagesMatched: null },
					{
						status: {
							in: [
								MailboxHistoricalImportChunkStatus.PENDING,
								MailboxHistoricalImportChunkStatus.WAITING_RATE_LIMIT,
								MailboxHistoricalImportChunkStatus.RETRYABLE_FAILED,
								MailboxHistoricalImportChunkStatus.RUNNING,
							],
						},
					},
				],
			},
		});

		if (pendingWork > 0) return null;

		return this.db.mailboxHistoricalImportChunk.findFirst({
			where: {
				jobId,
				status: MailboxHistoricalImportChunkStatus.COMPLETED,
				verificationStatus: {
					not: MailboxHistoricalImportVerificationStatus.VERIFIED,
				},
				OR: [{ retryAfterAt: null }, { retryAfterAt: { lte: now } }],
			},
			orderBy: [{ after: "asc" }, { before: "asc" }],
		});
	}

	private async markChunkRunning(
		jobId: string,
		chunkId: string,
		now: Date,
	): Promise<void> {
		await this.db.$transaction([
			this.db.mailboxHistoricalImportChunk.update({
				where: { id: chunkId },
				data: {
					status: MailboxHistoricalImportChunkStatus.RUNNING,
					startedAt: now,
					retryAfterAt: null,
				},
			}),
			this.db.mailboxHistoricalImportJob.update({
				where: { id: jobId },
				data: {
					status: MailboxHistoricalImportJobStatus.RUNNING,
					currentChunkId: chunkId,
					retryAfterAt: null,
				},
			}),
		]);
	}

	private async claimDueJob(
		now: Date,
	): Promise<MailboxHistoricalImportJobModel | null> {
		const where = dueJobWhere(now);
		const job = await this.db.mailboxHistoricalImportJob.findFirst({
			where,
			orderBy: [{ createdAt: "asc" }],
		});

		if (!job) return null;

		const { count } = await this.db.mailboxHistoricalImportJob.updateMany({
			where: { id: job.id, updatedAt: job.updatedAt, ...where },
			data: {
				leaseExpiresAt: addMs(now, GMAIL_SYNC.historicalImport.leaseMs),
			},
		});

		if (count !== 1) return null;
		return this.db.mailboxHistoricalImportJob.findUnique({
			where: { id: job.id },
		});
	}

	private async releaseJob(jobId: string): Promise<void> {
		await this.db.mailboxHistoricalImportJob.updateMany({
			where: { id: jobId },
			data: { leaseExpiresAt: null },
		});
	}

	private async loadJob(jobId: string): Promise<JobWithChunks | null> {
		return this.db.mailboxHistoricalImportJob.findUnique({
			where: { id: jobId },
			include: { chunks: { orderBy: [{ after: "asc" }, { before: "asc" }] } },
		});
	}

	private async refreshProgress(jobId: string): Promise<void> {
		const job = await this.loadJob(jobId);
		if (!job) return;

		const finalChunks = job.chunks.filter(
			(chunk) => chunk.messagesMatched !== null,
		);
		const totalMessages = sum(
			finalChunks,
			(chunk) => chunk.messagesMatched ?? 0,
		);
		const writtenMessages = sum(finalChunks, (chunk) => chunk.messagesWritten);
		const alreadyStoredMessages = sum(
			finalChunks,
			(chunk) => chunk.messagesAlreadyStored,
		);
		const ignoredMessages = sum(finalChunks, (chunk) => chunk.messagesIgnored);
		const processedMessages =
			writtenMessages + alreadyStoredMessages + ignoredMessages;
		const remainingMessages = Math.max(0, totalMessages - processedMessages);
		const totalChunks = finalChunks.length;
		const completedChunks = finalChunks.filter(
			(chunk) => chunk.status === MailboxHistoricalImportChunkStatus.COMPLETED,
		).length;
		const verifiedChunks = finalChunks.filter(
			(chunk) =>
				chunk.status === MailboxHistoricalImportChunkStatus.COMPLETED &&
				chunk.verificationStatus ===
					MailboxHistoricalImportVerificationStatus.VERIFIED,
		).length;
		const nextStatus = statusFor(
			job,
			totalChunks,
			completedChunks,
			verifiedChunks,
		);
		const completedAt =
			nextStatus === MailboxHistoricalImportJobStatus.COMPLETED
				? (job.completedAt ?? new Date())
				: job.completedAt;
		const verifiedAt =
			nextStatus === MailboxHistoricalImportJobStatus.COMPLETED
				? (job.verifiedAt ?? new Date())
				: job.verifiedAt;

		await this.db.mailboxHistoricalImportJob.update({
			where: { id: jobId },
			data: {
				status: nextStatus,
				totalMessages,
				processedMessages,
				writtenMessages,
				alreadyStoredMessages,
				ignoredMessages,
				remainingMessages,
				totalChunks,
				completedChunks,
				completedAt,
				verifiedAt,
			},
		});
	}
}

function dueJobWhere(now: Date): Prisma.MailboxHistoricalImportJobWhereInput {
	return {
		source: "gmail",
		status: { in: [...ACTIVE_JOB_STATUSES] },
		OR: [{ retryAfterAt: null }, { retryAfterAt: { lte: now } }],
		AND: [
			{
				OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
			},
		],
	};
}

function statusFor(
	job: JobWithChunks,
	totalChunks: number,
	completedChunks: number,
	verifiedChunks: number,
): MailboxHistoricalImportJobStatus {
	if (
		job.status === MailboxHistoricalImportJobStatus.PAUSED ||
		job.status === MailboxHistoricalImportJobStatus.CANCELLED ||
		job.status === MailboxHistoricalImportJobStatus.FAILED ||
		job.status === MailboxHistoricalImportJobStatus.RECONNECT_REQUIRED ||
		job.status === MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT ||
		job.status === MailboxHistoricalImportJobStatus.WAITING_RETRY
	) {
		return job.status;
	}

	if (
		job.chunks.some(
			(chunk) =>
				chunk.status === MailboxHistoricalImportChunkStatus.WAITING_RATE_LIMIT,
		)
	) {
		return MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT;
	}

	if (
		job.chunks.some(
			(chunk) =>
				chunk.status === MailboxHistoricalImportChunkStatus.RETRYABLE_FAILED,
		)
	) {
		return MailboxHistoricalImportJobStatus.WAITING_RETRY;
	}

	if (job.chunks.some((chunk) => chunk.messagesMatched === null)) {
		return MailboxHistoricalImportJobStatus.PLANNING;
	}

	if (totalChunks > 0 && verifiedChunks === totalChunks) {
		return MailboxHistoricalImportJobStatus.COMPLETED;
	}

	if (totalChunks > 0 && completedChunks === totalChunks) {
		return MailboxHistoricalImportJobStatus.VERIFYING;
	}

	return MailboxHistoricalImportJobStatus.READY;
}

function serializeJob(job: JobWithChunks): HistoricalImportJobOutput {
	const currentChunk =
		job.chunks.find((chunk) => chunk.id === job.currentChunkId) ??
		job.chunks.find(
			(chunk) => chunk.status !== MailboxHistoricalImportChunkStatus.COMPLETED,
		) ??
		null;

	return {
		id: job.id,
		userId: job.userId,
		source: "gmail",
		requestedAfter: job.requestedAfter.toISOString(),
		requestedBefore: job.requestedBefore.toISOString(),
		status: job.status,
		totalMessages: job.totalMessages,
		processedMessages: job.processedMessages,
		writtenMessages: job.writtenMessages,
		alreadyStoredMessages: job.alreadyStoredMessages,
		ignoredMessages: job.ignoredMessages,
		remainingMessages: job.remainingMessages,
		totalChunks: job.totalChunks,
		completedChunks: job.completedChunks,
		progressPercentage:
			job.totalMessages === 0
				? job.status === MailboxHistoricalImportJobStatus.COMPLETED
					? 100
					: 0
				: Number(
						Math.min(
							100,
							(job.processedMessages / job.totalMessages) * 100,
						).toFixed(1),
					),
		currentChunk: currentChunk ? serializeChunk(currentChunk) : null,
		retryAfterAt: job.retryAfterAt?.toISOString() ?? null,
		startedAt: job.startedAt?.toISOString() ?? null,
		completedAt: job.completedAt?.toISOString() ?? null,
		verifiedAt: job.verifiedAt?.toISOString() ?? null,
		lastError: job.lastError,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	};
}

function serializeChunk(
	chunk: MailboxHistoricalImportChunkModel,
): SerializedChunk {
	return {
		id: chunk.id,
		after: chunk.after.toISOString(),
		before: chunk.before.toISOString(),
		status: chunk.status,
		messagesMatched: chunk.messagesMatched,
		messagesAlreadyStored: chunk.messagesAlreadyStored,
		messagesAttempted: chunk.messagesAttempted,
		messagesWritten: chunk.messagesWritten,
		messagesIgnored: chunk.messagesIgnored,
		messagesRemaining: chunk.messagesRemaining,
		retryAfterAt: chunk.retryAfterAt?.toISOString() ?? null,
		attemptCount: chunk.attemptCount,
		lastError: chunk.lastError,
		failedMessageId: chunk.failedMessageId,
		verifiedAt: chunk.verifiedAt?.toISOString() ?? null,
		verificationStatus: chunk.verificationStatus,
	};
}

function emptyTick(jobId: string | null = null): HistoricalImportTickOutput {
	return {
		attempted: 0,
		planned: 0,
		processed: 0,
		verified: 0,
		waiting: 0,
		failed: 0,
		completed: 0,
		jobId,
	};
}

function monthRanges(
	after: Date,
	before: Date,
): { after: Date; before: Date }[] {
	const ranges: { after: Date; before: Date }[] = [];
	let cursor = new Date(after);

	while (cursor < before) {
		const next = nextMonthBoundary(cursor);
		const end = next < before ? next : before;
		ranges.push({ after: new Date(cursor), before: new Date(end) });
		cursor = end;
	}

	return ranges;
}

function nextMonthBoundary(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0),
	);
}

function splitRange(
	after: Date,
	before: Date,
): { after: Date; before: Date }[] {
	const duration = before.getTime() - after.getTime();
	if (duration <= GMAIL_SYNC.historicalImport.minSplitMs) return [];

	const step =
		duration > WEEK_MS ? WEEK_MS : duration > DAY_MS ? DAY_MS : duration / 2;
	const ranges: { after: Date; before: Date }[] = [];
	let cursor = new Date(after);

	while (cursor < before) {
		const end = new Date(Math.min(before.getTime(), cursor.getTime() + step));
		ranges.push({ after: new Date(cursor), before: end });
		cursor = end;
	}

	return ranges;
}

function addMs(date: Date, ms: number): Date {
	return new Date(date.getTime() + ms);
}

function sortIndex(date: Date): number {
	return Math.floor(date.getTime() / 1000);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function lastBackoffMs(): number {
	return (
		GMAIL_SYNC.historicalImport.retryBackoffMs.at(-1) ??
		GMAIL_SYNC.historicalImport.defaultRateLimitMs
	);
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
	return values.reduce((total, value) => total + select(value), 0);
}
