import { afterAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	BusinessEventSource,
	CommunicationChannel,
	ConversationPriority,
	ConversationStatus,
	db,
	EmailDirection,
	MailboxHistoricalImportChunkStatus,
	MailboxHistoricalImportJobStatus,
	MailboxHistoricalImportVerificationStatus,
} from "@crm/db";
import type { GmailBackfillInput } from "../src/google/gmail-backfill";
import { GmailHistoricalImportService } from "../src/google/gmail-historical-import.service";
import {
	type GmailBackfillOutcome,
	type GmailSyncService,
} from "../src/google/gmail-sync.service";

type Outcome = Partial<GmailBackfillOutcome> & {
	status: GmailBackfillOutcome["status"];
};

const suffix = process.env.TEST_RUN_ID ?? "gmail-historical-import-spec";

class FakeGmailBackfill {
	readonly calls: GmailBackfillInput[] = [];
	readonly outcomes: Outcome[] = [];

	push(outcome: Outcome): void {
		this.outcomes.push(outcome);
	}

	async backfill(input: GmailBackfillInput): Promise<GmailBackfillOutcome> {
		this.calls.push(input);
		const outcome = this.outcomes.shift();
		if (!outcome) throw new Error("Missing Gmail backfill outcome.");

		return {
			source: "gmail",
			userId: input.userId,
			dryRun: input.dryRun,
			after: input.after.toISOString(),
			before: input.before.toISOString(),
			max: input.max,
			messagesMatched: 0,
			messagesAlreadyStored: 0,
			messagesWouldFetch: 0,
			messagesAttempted: 0,
			messagesWritten: 0,
			messagesRemaining: 0,
			messagesIgnored: 0,
			pagesRead: 1,
			truncated: false,
			...outcome,
			status: outcome.status,
		};
	}
}

async function kit(name: string) {
	const marker = `${suffix}-${name}`;
	await clean(suffix);

	const userId = `user-${marker}`;
	await db.user.create({
		data: {
			id: userId,
			name: "Historical Import Rep",
			email: `${userId}@test.local`,
		},
	});

	const gmail = new FakeGmailBackfill();
	const service = new GmailHistoricalImportService(
		db,
		gmail as unknown as GmailSyncService,
	);

	return { marker, userId, gmail, service };
}

async function clean(marker: string): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { idempotencyKey: { contains: marker } },
	});
	await db.conversation.deleteMany({
		where: { externalThreadId: { contains: marker } },
	});
	await db.activity.deleteMany({ where: { subject: { contains: marker } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: marker } },
	});
	await db.mailboxHistoricalImportJob.deleteMany({
		where: { userId: { contains: marker } },
	});
	await db.user.deleteMany({ where: { id: { contains: marker } } });
}

async function chunks(jobId: string) {
	return db.mailboxHistoricalImportChunk.findMany({
		where: { jobId },
		orderBy: [{ after: "asc" }, { before: "asc" }],
	});
}

async function createJob(
	setup: Awaited<ReturnType<typeof kit>>,
	after = "2025-01-01T00:00:00.000Z",
	before = "2025-02-01T00:00:00.000Z",
) {
	return setup.service.create(setup.userId, {
		requestedAfter: new Date(after),
		requestedBefore: new Date(before),
	});
}

async function runningLeaf(
	setup: Awaited<ReturnType<typeof kit>>,
	options: {
		leaseExpiresAt: Date | null;
		messagesMatched?: number | null;
		messagesWritten?: number;
		messagesIgnored?: number;
		messagesRemaining?: number;
		now: Date;
	},
) {
	const messagesMatched = options.messagesMatched ?? 3;
	const job = await createJob(setup);

	if (messagesMatched !== null) {
		setup.gmail.push({
			status: "synced",
			messagesMatched,
			messagesWouldFetch: options.messagesRemaining ?? messagesMatched,
		});
		await setup.service.tick(options.now);
	}

	const [chunk] = await chunks(job.id);
	if (!chunk) throw new Error("Expected one chunk.");

	await db.mailboxHistoricalImportChunk.update({
		where: { id: chunk.id },
		data: {
			status: MailboxHistoricalImportChunkStatus.RUNNING,
			messagesMatched,
			messagesWritten: options.messagesWritten ?? 0,
			messagesIgnored: options.messagesIgnored ?? 0,
			messagesRemaining: options.messagesRemaining ?? messagesMatched ?? 0,
			startedAt: options.now,
			completedAt: null,
			retryAfterAt: null,
			lastError: null,
			failedMessageId: null,
		},
	});
	const updatedJob = await db.mailboxHistoricalImportJob.update({
		where: { id: job.id },
		data: {
			status: MailboxHistoricalImportJobStatus.READY,
			currentChunkId: chunk.id,
			leaseExpiresAt: options.leaseExpiresAt,
			retryAfterAt: null,
		},
	});
	const updatedChunk = await db.mailboxHistoricalImportChunk.findUniqueOrThrow({
		where: { id: chunk.id },
	});

	return { job: updatedJob, chunk: updatedChunk };
}

async function productionShape(setup: Awaited<ReturnType<typeof kit>>) {
	const requestedAfter = new Date("2024-01-01T00:00:00.000Z");
	const requestedBefore = new Date("2024-01-16T00:00:00.000Z");
	const job = await db.mailboxHistoricalImportJob.create({
		data: {
			userId: setup.userId,
			source: "gmail",
			requestedAfter,
			requestedBefore,
			status: MailboxHistoricalImportJobStatus.READY,
			totalMessages: 2242,
			processedMessages: 2107,
			writtenMessages: 2107,
			remainingMessages: 135,
			totalChunks: 15,
			completedChunks: 14,
		},
	});
	const completedCounts = [...Array.from({ length: 13 }, () => 150), 157];
	const completed = completedCounts.map((count, index) => ({
		id: `${setup.marker}-completed-${index}`,
		jobId: job.id,
		after: new Date(Date.UTC(2024, 0, index + 1)),
		before: new Date(Date.UTC(2024, 0, index + 2)),
		sortIndex: index,
		status: MailboxHistoricalImportChunkStatus.COMPLETED,
		messagesMatched: count,
		messagesAttempted: count,
		messagesWritten: count,
		messagesRemaining: 0,
		completedAt: new Date(Date.UTC(2024, 0, index + 2)),
		verifiedAt: new Date(Date.UTC(2024, 0, index + 2)),
		verificationStatus: MailboxHistoricalImportVerificationStatus.VERIFIED,
	}));
	const chunkId = `${setup.marker}-running`;

	await db.mailboxHistoricalImportChunk.createMany({
		data: [
			...completed,
			{
				id: chunkId,
				jobId: job.id,
				after: new Date("2024-01-15T00:00:00.000Z"),
				before: requestedBefore,
				sortIndex: 14,
				status: MailboxHistoricalImportChunkStatus.RUNNING,
				messagesMatched: 135,
				messagesAttempted: 0,
				messagesWritten: 0,
				messagesRemaining: 135,
			},
		],
	});
	await seedProjectionRows(setup);
	await db.mailboxHistoricalImportJob.update({
		where: { id: job.id },
		data: { currentChunkId: completed[0]?.id ?? null },
	});

	const updatedJob = await db.mailboxHistoricalImportJob.findUniqueOrThrow({
		where: { id: job.id },
	});
	const chunk = await db.mailboxHistoricalImportChunk.findUniqueOrThrow({
		where: { id: chunkId },
	});

	return { job: updatedJob, chunk };
}

async function seedProjectionRows(setup: Awaited<ReturnType<typeof kit>>) {
	const rootMessageId = `<root-${setup.marker}@mail.test>`;
	const emailThread = await db.emailThread.create({
		data: {
			rootMessageId,
			subject: `Duplicate ${setup.marker}`,
			firstMessageAt: new Date("2024-01-15T00:00:00.000Z"),
			lastMessageAt: new Date("2024-01-15T00:00:00.000Z"),
		},
	});
	await db.emailMessage.create({
		data: {
			threadId: emailThread.id,
			rfcMessageId: `<message-${setup.marker}@mail.test>`,
			syncedByUserId: setup.userId,
			gmailMessageId: `gmail-${setup.marker}`,
			direction: EmailDirection.INBOUND,
			fromEmail: `customer-${setup.marker}@example.test`,
			recipients: [],
			subject: `Duplicate ${setup.marker}`,
			body: "Hello",
			sentAt: new Date("2024-01-15T00:00:00.000Z"),
		},
	});
	await db.activity.create({
		data: {
			type: ActivityType.EMAIL,
			subject: `Duplicate ${setup.marker}`,
			body: "Hello",
			occurredAt: new Date("2024-01-15T00:00:00.000Z"),
			createdById: setup.userId,
			emailThreadId: emailThread.id,
		},
	});
	const conversation = await db.conversation.create({
		data: {
			channel: CommunicationChannel.EMAIL,
			status: ConversationStatus.OPEN,
			priority: ConversationPriority.NORMAL,
			subject: `Duplicate ${setup.marker}`,
			externalThreadId: `thread-${setup.marker}`,
			emailThreadId: emailThread.id,
		},
	});
	await db.businessEvent.create({
		data: {
			type: "email.received",
			source: BusinessEventSource.GMAIL,
			channel: CommunicationChannel.EMAIL,
			conversationId: conversation.id,
			occurredAt: new Date("2024-01-15T00:00:00.000Z"),
			data: {},
			correlationId: rootMessageId,
			idempotencyKey: `gmail:${setup.marker}`,
		},
	});
}

async function duplicateCounts(marker: string) {
	const [emailMessages, emailThreads, activities, conversations, events] =
		await Promise.all([
			db.emailMessage.count({
				where: { gmailMessageId: { contains: marker } },
			}),
			db.emailThread.count({ where: { rootMessageId: { contains: marker } } }),
			db.activity.count({ where: { subject: { contains: marker } } }),
			db.conversation.count({
				where: { externalThreadId: { contains: marker } },
			}),
			db.businessEvent.count({
				where: { idempotencyKey: { contains: marker } },
			}),
		]);

	return { emailMessages, emailThreads, activities, conversations, events };
}

afterAll(async () => {
	await clean(suffix);
});

describe("GmailHistoricalImportService planning", () => {
	it("creates a persistent job with calendar-month candidates", async () => {
		const setup = await kit("create");
		const job = await createJob(
			setup,
			"2025-01-15T00:00:00.000Z",
			"2025-04-10T00:00:00.000Z",
		);

		const planned = await chunks(job.id);

		expect(job.status).toBe(MailboxHistoricalImportJobStatus.PLANNING);
		expect(planned).toHaveLength(4);
		expect(planned.map((chunk) => chunk.messagesMatched)).toEqual([
			null,
			null,
			null,
			null,
		]);
	});

	it("plans a month below the safe max as a leaf chunk", async () => {
		const setup = await kit("monthly-leaf");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "synced",
			messagesMatched: 10,
			messagesAlreadyStored: 2,
			messagesWouldFetch: 8,
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.READY);
		expect(updated.totalMessages).toBe(10);
		expect(updated.alreadyStoredMessages).toBe(2);
		expect(updated.remainingMessages).toBe(8);
	});

	it("splits a truncated month into non-overlapping weeks", async () => {
		const setup = await kit("month-split");
		const job = await createJob(setup);
		setup.gmail.push({ status: "synced", truncated: true });

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const planned = await chunks(job.id);

		expect(planned.length).toBeGreaterThan(1);
		expect(overlaps(planned)).toBe(false);
	});

	it("splits a truncated week into days", async () => {
		const setup = await kit("week-split");
		const job = await createJob(
			setup,
			"2025-01-01T00:00:00.000Z",
			"2025-01-08T00:00:00.000Z",
		);
		setup.gmail.push({ status: "synced", truncated: true });

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const planned = await chunks(job.id);

		expect(planned).toHaveLength(7);
		expect(overlaps(planned)).toBe(false);
	});

	it("does not double-count parent chunks after splitting", async () => {
		const setup = await kit("leaf-count");
		const job = await createJob(setup);
		setup.gmail.push({ status: "synced", truncated: true });
		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));

		for (let index = 0; index < 5; index += 1) {
			setup.gmail.push({
				status: "synced",
				messagesMatched: index + 1,
				messagesWouldFetch: index + 1,
			});
			await setup.service.tick(new Date(`2025-01-0${index + 2}T00:00:00.000Z`));
		}

		const updated = await setup.service.byId(setup.userId, job.id);

		expect(updated.totalMessages).toBe(15);
		expect(updated.totalChunks).toBe(5);
	});
});

describe("GmailHistoricalImportService worker", () => {
	it("processes the next pending chunk and verifies completion later", async () => {
		const setup = await kit("process");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "synced",
			messagesMatched: 3,
			messagesWouldFetch: 3,
		});
		setup.gmail.push({
			status: "synced",
			messagesMatched: 3,
			messagesWritten: 3,
			messagesAttempted: 3,
		});
		setup.gmail.push({ status: "synced", messagesWouldFetch: 0 });

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:01:00.000Z"));
		const beforeVerify = await setup.service.byId(setup.userId, job.id);
		await setup.service.tick(new Date("2025-01-01T00:02:00.000Z"));
		const completed = await setup.service.byId(setup.userId, job.id);

		expect(beforeVerify.status).toBe(
			MailboxHistoricalImportJobStatus.VERIFYING,
		);
		expect(completed.status).toBe(MailboxHistoricalImportJobStatus.COMPLETED);
		expect(completed.writtenMessages).toBe(3);
		expect(completed.completedChunks).toBe(1);
	});

	it("resumes the same failed chunk after a message-level persistence failure", async () => {
		const setup = await kit("nul-resume");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "synced",
			messagesMatched: 2,
			messagesWouldFetch: 2,
		});
		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const [chunk] = await chunks(job.id);

		setup.gmail.push({
			status: "failed",
			reason:
				"Gmail message persistence failed (postgres-invalid-text-encoding).",
			failedMessageId: "gmail-nul",
		});
		await setup.service.tick(new Date("2025-01-01T00:01:00.000Z"));
		const failed = await setup.service.byId(setup.userId, job.id);
		const resumed = await setup.service.resume(setup.userId, job.id);
		const [resumedChunk] = await chunks(job.id);

		expect(failed.status).toBe(MailboxHistoricalImportJobStatus.FAILED);
		expect(failed.currentChunk?.failedMessageId).toBe("gmail-nul");
		expect(setup.gmail.calls[1]?.historicalImportJobId).toBe(job.id);
		expect(setup.gmail.calls[1]?.historicalImportChunkId).toBe(chunk?.id);
		expect(resumed.status).toBe(MailboxHistoricalImportJobStatus.READY);
		expect(resumed.totalMessages).toBe(2);
		expect(resumed.remainingMessages).toBe(2);
		expect(resumedChunk?.status).toBe(
			MailboxHistoricalImportChunkStatus.PENDING,
		);
		expect(resumedChunk?.failedMessageId).toBeNull();
	});

	it("keeps a rate-limited chunk due only after retryAfterAt", async () => {
		const setup = await kit("rate-limit");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "rate-limited",
			retryAfterMs: 60_000,
			reason: "Gmail rate limit.",
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const waiting = await setup.service.byId(setup.userId, job.id);
		const early = await setup.service.tick(
			new Date("2025-01-01T00:00:30.000Z"),
		);

		expect(waiting.status).toBe(
			MailboxHistoricalImportJobStatus.WAITING_RATE_LIMIT,
		);
		expect(waiting.retryAfterAt).not.toBeNull();
		expect(early.attempted).toBe(0);
	});

	it("resumes automatically after Gmail rate limits expire", async () => {
		const setup = await kit("rate-resume");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "rate-limited",
			retryAfterMs: 60_000,
			reason: "Gmail rate limit.",
		});
		setup.gmail.push({
			status: "synced",
			messagesMatched: 1,
			messagesWouldFetch: 1,
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:02:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.READY);
	});

	it("uses bounded exponential backoff for retryable failures", async () => {
		const setup = await kit("retryable");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "retryable-failed",
			reason: "HTTP 503",
			failedMessageId: "gmail-1",
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);
		const [chunk] = await chunks(job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.WAITING_RETRY);
		expect(chunk?.status).toBe(
			MailboxHistoricalImportChunkStatus.RETRYABLE_FAILED,
		);
		expect(chunk?.attemptCount).toBe(1);
		expect(chunk?.retryAfterAt?.toISOString()).toBe("2025-01-01T00:00:30.000Z");
	});

	it("fails after the max retry count", async () => {
		const setup = await kit("max-retry");
		const job = await createJob(setup);

		for (let index = 0; index < 7; index += 1) {
			setup.gmail.push({
				status: "retryable-failed",
				reason: "HTTP 503",
				failedMessageId: "gmail-1",
			});
			await setup.service.tick(
				new Date(Date.UTC(2025, 0, 1, 0, index * 16, 0, 0)),
			);
		}

		const updated = await setup.service.byId(setup.userId, job.id);
		const [chunk] = await chunks(job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.FAILED);
		expect(chunk?.status).toBe(MailboxHistoricalImportChunkStatus.FAILED);
	});

	it("requires reconnect without changing the live cursor", async () => {
		const setup = await kit("reconnect");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "reconnect",
			reason: "Token expired.",
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);

		expect(updated.status).toBe(
			MailboxHistoricalImportJobStatus.RECONNECT_REQUIRED,
		);
		expect(setup.gmail.calls[0]?.dryRun).toBe(true);
	});

	it("uses a job lease so a second overlapping tick skips the job", async () => {
		const setup = await kit("lock");
		const job = await createJob(setup);
		let release: (() => void) | undefined;
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		setup.gmail.backfill = async (input) => {
			setup.gmail.calls.push(input);
			await hold;
			return {
				source: "gmail",
				userId: input.userId,
				status: "synced",
				dryRun: input.dryRun,
				after: input.after.toISOString(),
				before: input.before.toISOString(),
				max: input.max,
				messagesMatched: 1,
				messagesWouldFetch: 1,
				truncated: false,
			};
		};

		const first = setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		await waitFor(() => setup.gmail.calls.length === 1);
		const second = await setup.service.tick(
			new Date("2025-01-01T00:00:01.000Z"),
		);
		release?.();
		await first;

		expect(second.attempted).toBe(0);
		expect((await chunks(job.id))[0]?.messagesMatched).toBe(1);
	});

	it("does not reclaim a running chunk while its job lease is active", async () => {
		const setup = await kit("running-active-lease");
		const now = new Date("2025-01-01T00:00:00.000Z");
		const { job, chunk } = await runningLeaf(setup, {
			leaseExpiresAt: new Date("2025-01-01T00:05:00.000Z"),
			now,
		});

		setup.gmail.push({
			status: "synced",
			messagesMatched: 3,
			messagesWritten: 3,
			messagesAttempted: 3,
		});
		const tick = await setup.service.tick(now);
		const [updated] = await chunks(job.id);
		const reloaded = await db.mailboxHistoricalImportJob.findUniqueOrThrow({
			where: { id: job.id },
		});

		expect(tick.attempted).toBe(0);
		expect(setup.gmail.calls).toHaveLength(1);
		expect(updated?.id).toBe(chunk.id);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.RUNNING);
		expect(reloaded.leaseExpiresAt?.toISOString()).toBe(
			"2025-01-01T00:05:00.000Z",
		);
	});

	it("reclaims a running chunk with no job lease and keeps its counters", async () => {
		const setup = await kit("running-null-lease");
		const now = new Date("2025-01-01T00:00:00.000Z");
		const { job, chunk } = await runningLeaf(setup, {
			leaseExpiresAt: null,
			messagesMatched: 135,
			messagesWritten: 10,
			messagesIgnored: 5,
			messagesRemaining: 120,
			now,
		});

		setup.gmail.push({
			status: "synced",
			messagesMatched: 135,
			messagesWritten: 100,
			messagesAttempted: 100,
			messagesRemaining: 0,
			ignoredMessageIds: Array.from(
				{ length: 5 },
				(_, index) => `ignored-${index}`,
			),
		});
		const tick = await setup.service.tick(now);
		const [updated] = await chunks(job.id);

		expect(tick.processed).toBe(1);
		expect(setup.gmail.calls[1]?.historicalImportJobId).toBe(job.id);
		expect(setup.gmail.calls[1]?.historicalImportChunkId).toBe(chunk.id);
		expect(updated?.id).toBe(chunk.id);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.COMPLETED);
		expect(updated?.messagesMatched).toBe(135);
		expect(updated?.messagesWritten).toBe(110);
		expect(updated?.messagesAlreadyStored).toBe(20);
		expect(updated?.messagesIgnored).toBe(5);
		expect(updated?.messagesRemaining).toBe(0);
	});

	it("counts refreshed legacy metadata separately from written and skipped", async () => {
		const setup = await kit("refreshed-counts");
		const now = new Date("2025-01-01T00:00:00.000Z");
		const { job } = await runningLeaf(setup, {
			leaseExpiresAt: null,
			messagesMatched: 4,
			messagesRemaining: 4,
			now,
		});

		setup.gmail.push({
			status: "synced",
			messagesMatched: 4,
			messagesWritten: 1,
			messagesRefreshed: 2,
			messagesAttempted: 1,
			messagesRemaining: 0,
		});
		const tick = await setup.service.tick(now);
		const [updated] = await chunks(job.id);

		expect(tick.processed).toBe(1);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.COMPLETED);
		expect(updated?.messagesWritten).toBe(1);
		expect(updated?.messagesRefreshed).toBe(2);
		expect(updated?.messagesAlreadyStored).toBe(1);
		expect(updated?.messagesRemaining).toBe(0);

		const output = await setup.service.byId(setup.userId, job.id);
		expect(output.writtenMessages).toBe(1);
		expect(output.refreshedMessages).toBe(2);
		expect(output.alreadyStoredMessages).toBe(1);
		expect(output.processedMessages).toBe(4);
		expect(output.remainingMessages).toBe(0);
	});

	it("reclaims a running chunk after its job lease expires", async () => {
		const setup = await kit("running-expired-lease");
		const now = new Date("2025-01-01T00:05:00.000Z");
		const { job, chunk } = await runningLeaf(setup, {
			leaseExpiresAt: new Date("2025-01-01T00:01:00.000Z"),
			messagesMatched: 4,
			messagesRemaining: 4,
			now: new Date("2025-01-01T00:00:00.000Z"),
		});

		setup.gmail.push({
			status: "synced",
			messagesMatched: 4,
			messagesWritten: 4,
			messagesAttempted: 4,
			messagesRemaining: 0,
		});
		const tick = await setup.service.tick(now);
		const [updated] = await chunks(job.id);

		expect(tick.processed).toBe(1);
		expect(setup.gmail.calls[1]?.historicalImportJobId).toBe(job.id);
		expect(setup.gmail.calls[1]?.historicalImportChunkId).toBe(chunk.id);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.COMPLETED);
		expect(updated?.messagesMatched).toBe(4);
		expect(updated?.messagesRemaining).toBe(0);
	});

	it("resume requeues a stale running chunk without replacing the job", async () => {
		const setup = await kit("resume-running");
		const now = new Date("2025-01-01T00:00:00.000Z");
		const { job, chunk } = await runningLeaf(setup, {
			leaseExpiresAt: null,
			now,
		});

		const resumed = await setup.service.resume(setup.userId, job.id);
		const [updated] = await chunks(job.id);

		expect(resumed.id).toBe(job.id);
		expect(resumed.currentChunk?.id).toBe(chunk.id);
		expect(updated?.id).toBe(chunk.id);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.PENDING);
		expect(updated?.messagesMatched).toBe(3);
		expect(setup.gmail.calls).toHaveLength(1);
	});

	it("resume leaves an actively leased running chunk alone", async () => {
		const setup = await kit("resume-active-running");
		const now = new Date("2025-01-01T00:00:00.000Z");
		const { job, chunk } = await runningLeaf(setup, {
			leaseExpiresAt: new Date(Date.now() + 60_000),
			now,
		});

		const resumed = await setup.service.resume(setup.userId, job.id);
		const [updated] = await chunks(job.id);

		expect(resumed.id).toBe(job.id);
		expect(resumed.currentChunk?.id).toBe(chunk.id);
		expect(updated?.status).toBe(MailboxHistoricalImportChunkStatus.RUNNING);
		expect(updated?.messagesMatched).toBe(3);
	});

	it("shows the incomplete chunk when currentChunkId points at a completed chunk", async () => {
		const setup = await kit("current-pointer");
		const job = await createJob(
			setup,
			"2025-01-01T00:00:00.000Z",
			"2025-03-01T00:00:00.000Z",
		);
		const [first, second] = await chunks(job.id);
		if (!first || !second) throw new Error("Expected two chunks.");

		await db.mailboxHistoricalImportChunk.update({
			where: { id: first.id },
			data: {
				status: MailboxHistoricalImportChunkStatus.COMPLETED,
				messagesMatched: 1,
				messagesWritten: 1,
				completedAt: new Date("2025-01-01T00:00:00.000Z"),
			},
		});
		await db.mailboxHistoricalImportChunk.update({
			where: { id: second.id },
			data: {
				status: MailboxHistoricalImportChunkStatus.RUNNING,
				messagesMatched: 2,
				messagesRemaining: 2,
			},
		});
		await db.mailboxHistoricalImportJob.update({
			where: { id: job.id },
			data: {
				status: MailboxHistoricalImportJobStatus.READY,
				currentChunkId: first.id,
				leaseExpiresAt: null,
			},
		});

		const displayed = await setup.service.byId(setup.userId, job.id);

		expect(displayed.currentChunk?.id).toBe(second.id);
	});

	it("moves a 2107 of 2242 stale state toward completion without duplicates", async () => {
		const setup = await kit("production-shape");
		const { job, chunk } = await productionShape(setup);
		const before = await duplicateCounts(setup.marker);

		setup.gmail.push({
			status: "synced",
			messagesMatched: 135,
			messagesWritten: 135,
			messagesAttempted: 135,
			messagesRemaining: 0,
		});
		const tick = await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);
		const [updatedChunk] = await db.mailboxHistoricalImportChunk.findMany({
			where: { id: chunk.id },
		});
		const after = await duplicateCounts(setup.marker);

		expect(tick.processed).toBe(1);
		expect(updated.id).toBe(job.id);
		expect(updated.totalMessages).toBe(2242);
		expect(updated.processedMessages).toBe(2242);
		expect(updated.remainingMessages).toBe(0);
		expect(updated.completedChunks).toBe(15);
		expect(updatedChunk?.id).toBe(chunk.id);
		expect(after).toEqual(before);
	});
});

describe("GmailHistoricalImportService controls and verification", () => {
	it("pauses, resumes and cancels without deleting imported state", async () => {
		const setup = await kit("controls");
		const job = await createJob(setup);

		const paused = await setup.service.pause(setup.userId, job.id);
		const resumed = await setup.service.resume(setup.userId, job.id);
		const cancelled = await setup.service.cancel(setup.userId, job.id);

		expect(paused.status).toBe(MailboxHistoricalImportJobStatus.PAUSED);
		expect(resumed.status).toBe(MailboxHistoricalImportJobStatus.PLANNING);
		expect(cancelled.status).toBe(MailboxHistoricalImportJobStatus.CANCELLED);
		expect(
			await db.mailboxHistoricalImportChunk.count({ where: { jobId: job.id } }),
		).toBe(1);
	});

	it("accepts intentionally ignored messages during verification", async () => {
		const setup = await kit("ignored-verification");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "synced",
			messagesMatched: 1,
			messagesWouldFetch: 1,
		});
		setup.gmail.push({
			status: "synced",
			messagesMatched: 1,
			messagesAttempted: 1,
			messagesIgnored: 1,
			messagesRemaining: 0,
			ignoredMessageIds: ["ignored-1"],
		});
		setup.gmail.push({
			status: "synced",
			messagesWouldFetch: 1,
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:01:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:02:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);
		const [chunk] = await chunks(job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.COMPLETED);
		expect(chunk?.verificationStatus).toBe(
			MailboxHistoricalImportVerificationStatus.VERIFIED,
		);
	});

	it("requeues a chunk when verification detects missing messages", async () => {
		const setup = await kit("missing-verification");
		const job = await createJob(setup);
		setup.gmail.push({
			status: "synced",
			messagesMatched: 1,
			messagesWouldFetch: 1,
		});
		setup.gmail.push({
			status: "synced",
			messagesMatched: 1,
			messagesWritten: 1,
			messagesAttempted: 1,
		});
		setup.gmail.push({
			status: "synced",
			messagesWouldFetch: 1,
		});

		await setup.service.tick(new Date("2025-01-01T00:00:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:01:00.000Z"));
		await setup.service.tick(new Date("2025-01-01T00:02:00.000Z"));
		const updated = await setup.service.byId(setup.userId, job.id);
		const [chunk] = await chunks(job.id);

		expect(updated.status).toBe(MailboxHistoricalImportJobStatus.READY);
		expect(chunk?.status).toBe(MailboxHistoricalImportChunkStatus.PENDING);
		expect(chunk?.verificationStatus).toBe(
			MailboxHistoricalImportVerificationStatus.MISSING,
		);
	});
});

function overlaps(chunks: { after: Date; before: Date }[]): boolean {
	for (let index = 1; index < chunks.length; index += 1) {
		const previous = chunks[index - 1];
		const current = chunks[index];
		if (!previous || !current) continue;
		if (previous.before > current.after) return true;
	}

	return false;
}

async function waitFor(check: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}

	throw new Error("Timed out waiting for test condition.");
}
