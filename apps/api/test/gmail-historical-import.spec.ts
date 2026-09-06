import { afterAll, describe, expect, it } from "bun:test";
import {
	db,
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
