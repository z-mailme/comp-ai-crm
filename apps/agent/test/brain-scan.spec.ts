import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, EmailDirection, MailboxMatchStatus, Prisma } from "@crm/db";
import { BRAIN } from "../agent/lib/brain-config";
import type { BrainExtractor } from "../agent/lib/brain-extractor";
import { runBrainScan } from "../agent/lib/brain-scan";
import { handleBrainScanTask } from "../agent/lib/dispatch";
import type { LeasedTask } from "../agent/lib/tasks";

const suffix =
	process.env.TEST_RUN_ID ?? `brain-scan-spec-${crypto.randomUUID()}`;

const leasedTaskSelect = {
	id: true,
	contactId: true,
	companyId: true,
	dealId: true,
	kind: true,
	reason: true,
	payload: true,
	budget: true,
	attempts: true,
	priority: true,
	dueAt: true,
} satisfies Prisma.AgentTaskSelect;

const extractor: BrainExtractor = async (threads) => ({
	facts: threads.flatMap((thread) => [
		{
			threadId: thread.threadId,
			kind: "FACT" as const,
			subject: `Fact from ${thread.subject}`,
			detail: null,
			confidence: 0.9,
		},
		...(thread.companyId
			? [
					{
						threadId: thread.threadId,
						kind: "PRICING" as const,
						subject: `Price seen in ${thread.subject}`,
						detail: null,
						confidence: 0.8,
					},
				]
			: []),
	]),
	usage: {
		inputTokens: 100,
		outputTokens: 20,
		model: "test/model",
		provider: "test",
	},
});

async function seedMailbox(name: string, threadCount: number) {
	const marker = `${suffix}-${name}`;
	const userId = `user-${marker}`;
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `rep-${marker}@example.test` },
	});

	const company = await db.company.create({
		data: { name: `Brain Co ${marker}`, updatedAt: new Date() },
	});

	for (let index = 0; index < threadCount; index++) {
		const sentAt = new Date(Date.UTC(2026, 0, 1, 10, index));
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${marker}-${index}`,
				subject: `Thread ${index} ${marker}`,
				matchStatus: MailboxMatchStatus.MATCHED_COMPANY,
				companyId: company.id,
				firstMessageAt: sentAt,
				lastMessageAt: sentAt,
				messageCount: 1,
			},
		});

		await db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: `msg-${marker}-${index}`,
				syncedByUserId: userId,
				gmailMessageId: `gmail-${marker}-${index}`,
				gmailThreadId: `gt-${marker}-${index}`,
				labelIds: ["INBOX"],
				direction: EmailDirection.INBOUND,
				fromEmail: "customer@example.test",
				recipients: [],
				subject: `Thread ${index} ${marker}`,
				body: `Draping quote R${150 + index} per metre for Thread ${index}.`,
				sentAt,
			},
		});
	}

	return { userId, companyId: company.id };
}

async function clean(): Promise<void> {
	const jobs = await db.brainAnalysisJob.findMany({
		where: { userId: { contains: suffix } },
		select: { id: true },
	});
	const jobIds = jobs.map((job) => job.id);
	if (jobIds.length > 0) {
		await db.$executeRaw`
			DELETE FROM "agentTask"
			WHERE kind = 'brain-scan'
				AND payload->>'jobId' IN (${Prisma.join(jobIds)})
		`;
	}
	await db.businessKnowledge.deleteMany({
		where: { subject: { contains: suffix } },
	});
	await db.brainAnalysisJob.deleteMany({
		where: { userId: { contains: suffix } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: suffix } },
	});
	await db.company.deleteMany({ where: { name: { contains: suffix } } });
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
}

async function createBrainTask(jobId: string): Promise<LeasedTask> {
	return db.agentTask.create({
		data: {
			kind: "brain-scan",
			reason: `Analyse Gmail ${suffix}`,
			payload: { jobId },
			dueAt: new Date(Date.now() - 1000),
			priority: 300,
			budget: 50,
		},
		select: leasedTaskSelect,
	});
}

async function nextBrainTask(jobId: string): Promise<LeasedTask> {
	const task = await db.agentTask.findFirst({
		where: {
			kind: "brain-scan",
			finishedAt: null,
			subject: `brain-scan:${jobId}`,
		},
		select: leasedTaskSelect,
	});
	expect(task).not.toBeNull();
	return task as LeasedTask;
}

beforeEach(clean);
afterAll(clean);

describe("runBrainScan", () => {
	it("processes batches with checkpoints until the mailbox is done", async () => {
		const { userId } = await seedMailbox("full", BRAIN.batchSize + 2);

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		const first = await runBrainScan({ jobId: job.id }, extractor);
		expect(first.finished).toBe(false);
		expect(first.processed).toBe(BRAIN.batchSize);

		const afterFirst = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(afterFirst?.status).toBe("RUNNING");
		expect(afterFirst?.totalThreads).toBe(BRAIN.batchSize + 2);
		expect(afterFirst?.processedThreads).toBe(BRAIN.batchSize);
		expect(afterFirst?.cursorThreadId).toBeTruthy();

		const second = await runBrainScan({ jobId: job.id }, extractor);
		expect(second.finished).toBe(true);
		expect(second.processed).toBe(2);

		const afterSecond = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(afterSecond?.status).toBe("COMPLETED");
		expect(afterSecond?.processedThreads).toBe(BRAIN.batchSize + 2);
		expect(afterSecond?.knowledgeWritten).toBeGreaterThan(0);
		expect(afterSecond?.tokensInput).toBe(200);
		expect(afterSecond?.modelUsed).toBe("test/model");
	});

	it("keeps a human-confirmed rule and records the conflict as inference", async () => {
		const { userId, companyId } = await seedMailbox("conflict", 1);

		await db.businessKnowledge.create({
			data: {
				kind: "PRICING",
				subject: "Confirmed rule stays",
				sourceType: "CRM",
				sourceId: `manual-${suffix}`,
				humanConfirmed: true,
				confirmedAt: new Date(),
				companyId,
			},
		});

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		await runBrainScan({ jobId: job.id }, extractor);

		const confirmed = await db.businessKnowledge.findFirst({
			where: { subject: "Confirmed rule stays" },
		});
		expect(confirmed?.supersededById).toBeNull();

		const inference = await db.businessKnowledge.findFirst({
			where: {
				kind: "INFERENCE",
				subject: { contains: "Confirmed rule stays" },
			},
		});
		expect(inference).not.toBeNull();

		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(updated?.conflictsFound).toBe(1);
	});

	it("honours pause and resumes from the checkpoint", async () => {
		const { userId } = await seedMailbox("pause", BRAIN.batchSize + 1);

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		await runBrainScan({ jobId: job.id }, extractor);

		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "PAUSED" },
		});

		const paused = await runBrainScan({ jobId: job.id }, extractor);
		expect(paused.processed).toBe(0);
		expect(paused.reason).toContain("paused");

		const held = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(held?.processedThreads).toBe(BRAIN.batchSize);

		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "RUNNING" },
		});

		const resumed = await runBrainScan({ jobId: job.id }, extractor);
		expect(resumed.finished).toBe(true);
		expect(resumed.processed).toBe(1);
	});

	it("fails the job when the extractor throws", async () => {
		const { userId } = await seedMailbox("failure", 1);

		const failing: BrainExtractor = async () => {
			throw new Error("model offline");
		};

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		const outcome = await runBrainScan({ jobId: job.id }, failing);
		expect(outcome.reason).toBe("model offline");

		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(updated?.status).toBe("FAILED");
		expect(updated?.lastError).toBe("model offline");
		expect(updated?.completedAt).not.toBeNull();
	});

	it("keeps the checkpoint when a later batch fails", async () => {
		const { userId } = await seedMailbox(
			"checkpoint-failure",
			BRAIN.batchSize + 1,
		);
		let calls = 0;
		const failingAfterFirst: BrainExtractor = async (threads) => {
			calls += 1;
			if (calls > 1) throw new Error("model timeout");
			return extractor(threads);
		};

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		await runBrainScan({ jobId: job.id }, failingAfterFirst);
		const afterFirst = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});

		const failed = await runBrainScan({ jobId: job.id }, failingAfterFirst);
		expect(failed.reason).toBe("model timeout");

		const afterFailure = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(afterFailure?.status).toBe("FAILED");
		expect(afterFailure?.processedThreads).toBe(BRAIN.batchSize);
		expect(afterFailure?.cursorThreadId).toBe(afterFirst?.cursorThreadId);
	});

	it("does not duplicate Gmail facts when a saved batch replays", async () => {
		const { userId } = await seedMailbox("idempotent", 2);
		const singleFact: BrainExtractor = async (threads) => ({
			facts: threads.map((thread) => ({
				threadId: thread.threadId,
				kind: "FACT" as const,
				subject: `Replay-safe fact from ${thread.subject}`,
				detail: null,
				confidence: 0.9,
			})),
			usage: {
				inputTokens: 10,
				outputTokens: 5,
				model: "test/model",
				provider: "test",
			},
		});

		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		const first = await runBrainScan({ jobId: job.id }, singleFact);
		expect(first.written).toBe(2);

		const countAfterFirst = await db.businessKnowledge.count({
			where: { subject: { contains: "Replay-safe fact" } },
		});

		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: {
				status: "RUNNING",
				cursorLastMessageAt: null,
				cursorThreadId: null,
				processedThreads: 0,
				knowledgeWritten: 0,
				completedAt: null,
			},
		});

		const replay = await runBrainScan({ jobId: job.id }, singleFact);
		expect(replay.written).toBe(0);

		const countAfterReplay = await db.businessKnowledge.count({
			where: { subject: { contains: "Replay-safe fact" } },
		});
		expect(countAfterReplay).toBe(countAfterFirst);
	});

	it("schedules a continuation after a successful non-exhausted batch", async () => {
		const { userId } = await seedMailbox("continuation", BRAIN.batchSize + 1);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		const task = await createBrainTask(job.id);

		await handleBrainScanTask(task, extractor);

		const open = await db.agentTask.findMany({
			where: {
				kind: "brain-scan",
				finishedAt: null,
				subject: `brain-scan:${job.id}`,
			},
			select: { id: true, payload: true, subject: true },
		});
		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});

		expect(open).toHaveLength(1);
		expect(open[0]?.id).not.toBe(task.id);
		expect(open[0]?.payload).toEqual({ jobId: job.id });
		expect(open[0]?.subject).toBe(`brain-scan:${job.id}`);
		expect(updated?.status).toBe("RUNNING");
		expect(updated?.processedThreads).toBe(BRAIN.batchSize);
	});

	it("uses the saved cursor on the next scheduled batch", async () => {
		const { userId } = await seedMailbox("cursor", BRAIN.batchSize * 2 + 1);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		await handleBrainScanTask(await createBrainTask(job.id), extractor);
		const afterFirst = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});

		await handleBrainScanTask(await nextBrainTask(job.id), extractor);

		const afterSecond = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(afterSecond?.status).toBe("RUNNING");
		expect(afterSecond?.processedThreads).toBe(BRAIN.batchSize * 2);
		expect(afterSecond?.cursorThreadId).not.toBe(afterFirst?.cursorThreadId);
	});

	it("does not schedule another task when the scan is exhausted", async () => {
		const { userId } = await seedMailbox("exhausted", BRAIN.batchSize - 1);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		const task = await createBrainTask(job.id);

		await handleBrainScanTask(task, extractor);

		const open = await db.agentTask.count({
			where: {
				kind: "brain-scan",
				finishedAt: null,
				OR: [{ id: task.id }, { subject: `brain-scan:${job.id}` }],
			},
		});
		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(open).toBe(0);
		expect(updated?.status).toBe("COMPLETED");
		expect(updated?.processedThreads).toBe(BRAIN.batchSize - 1);
	});

	it("auto-progresses three batches without another user action", async () => {
		const total = BRAIN.batchSize * 3;
		const { userId } = await seedMailbox("three-batches", total);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		await handleBrainScanTask(await createBrainTask(job.id), extractor);
		await handleBrainScanTask(await nextBrainTask(job.id), extractor);
		await handleBrainScanTask(await nextBrainTask(job.id), extractor);

		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		const open = await db.agentTask.count({
			where: {
				kind: "brain-scan",
				finishedAt: null,
				subject: `brain-scan:${job.id}`,
			},
		});
		expect(updated?.status).toBe("COMPLETED");
		expect(updated?.processedThreads).toBe(total);
		expect(open).toBe(0);
	});

	it("ignores duplicate delivery after the current task is complete", async () => {
		const { userId } = await seedMailbox(
			"duplicate-delivery",
			BRAIN.batchSize + 1,
		);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		const task = await createBrainTask(job.id);

		await handleBrainScanTask(task, extractor);
		const afterFirst = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		const factsAfterFirst = await db.businessKnowledge.count({
			where: { subject: { contains: "duplicate-delivery" } },
		});

		await handleBrainScanTask(task, extractor);

		const afterReplay = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		const factsAfterReplay = await db.businessKnowledge.count({
			where: { subject: { contains: "duplicate-delivery" } },
		});
		expect(afterReplay?.processedThreads).toBe(afterFirst?.processedThreads);
		expect(afterReplay?.knowledgeWritten).toBe(afterFirst?.knowledgeWritten);
		expect(factsAfterReplay).toBe(factsAfterFirst);
	});

	it("resumes from the saved cursor after an agent restart", async () => {
		const { userId } = await seedMailbox("restart", BRAIN.batchSize * 2 + 1);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		await handleBrainScanTask(await createBrainTask(job.id), extractor);

		const restartedTask = await nextBrainTask(job.id);
		await handleBrainScanTask(restartedTask, extractor);

		const updated = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(updated?.status).toBe("RUNNING");
		expect(updated?.processedThreads).toBe(BRAIN.batchSize * 2);
		expect(updated?.cursorThreadId).toBeTruthy();
	});

	it("keeps the current task recoverable when continuation creation fails", async () => {
		const { userId } = await seedMailbox(
			"schedule-failure",
			BRAIN.batchSize * 2 + 1,
		);
		const job = await db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});
		const task = await createBrainTask(job.id);

		let thrown: unknown;
		try {
			await handleBrainScanTask(task, extractor, async () => {
				throw new Error("queue unavailable");
			});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe("queue unavailable");

		const openCurrent = await db.agentTask.findUnique({
			where: { id: task.id },
		});
		const afterFailure = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(openCurrent?.finishedAt).toBeNull();
		expect(afterFailure?.status).toBe("RUNNING");
		expect(afterFailure?.processedThreads).toBe(BRAIN.batchSize);

		await handleBrainScanTask(task, extractor);
		const recovered = await db.brainAnalysisJob.findUnique({
			where: { id: job.id },
		});
		expect(recovered?.processedThreads).toBe(BRAIN.batchSize * 2);
	});
});
