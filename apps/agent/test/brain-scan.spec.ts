import { afterAll, describe, expect, it } from "bun:test";
import { db, EmailDirection, MailboxMatchStatus } from "@crm/db";
import { BRAIN } from "../agent/lib/brain-config";
import type { BrainExtractor } from "../agent/lib/brain-extractor";
import { runBrainScan } from "../agent/lib/brain-scan";

const suffix = process.env.TEST_RUN_ID ?? "brain-scan-spec";

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
	});
});
