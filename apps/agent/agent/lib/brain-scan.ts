import { db, type Prisma } from "@crm/db";
import {
	currentKnowledge,
	type KnowledgeInput,
	recordKnowledge,
	supersedeKnowledge,
} from "@crm/db/knowledge";
import { z } from "zod";
import { BRAIN } from "./brain-config";
import type {
	BrainExtractor,
	ExtractionResult,
	ThreadDigest,
} from "./brain-extractor";

const CONFLICT_KINDS = new Set(["PRICING", "POLICY", "PRODUCT_SERVICE"]);

const brainScanPayload = z.object({ jobId: z.string().min(1) });

export type BrainScanOutcome = {
	processed: number;
	written: number;
	conflicts: number;
	finished: boolean;
	reason?: string;
};

export async function runBrainScan(
	payload: Prisma.JsonValue | null,
	extract: BrainExtractor,
): Promise<BrainScanOutcome> {
	const parsed = brainScanPayload.safeParse(payload);
	if (!parsed.success) {
		return {
			processed: 0,
			written: 0,
			conflicts: 0,
			finished: true,
			reason: "No job was named.",
		};
	}

	const job = await db.brainAnalysisJob.findUnique({
		where: { id: parsed.data.jobId },
	});

	if (!job) {
		return {
			processed: 0,
			written: 0,
			conflicts: 0,
			finished: true,
			reason: "The job is gone.",
		};
	}

	if (job.status === "PAUSED" || job.status === "CANCELLED") {
		return {
			processed: 0,
			written: 0,
			conflicts: 0,
			finished: true,
			reason: `The job is ${job.status.toLowerCase()}.`,
		};
	}

	if (job.status === "COMPLETED" || job.status === "FAILED") {
		return { processed: 0, written: 0, conflicts: 0, finished: true };
	}

	if (job.status === "PLANNING") {
		const total = await db.emailThread.count({
			where: { messages: { some: { syncedByUserId: job.userId } } },
		});

		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "RUNNING", totalThreads: total, startedAt: new Date() },
		});
	}

	const where: Prisma.EmailThreadWhereInput = {
		messages: { some: { syncedByUserId: job.userId } },
	};

	if (job.cursorLastMessageAt && job.cursorThreadId) {
		where.OR = [
			{ lastMessageAt: { gt: job.cursorLastMessageAt } },
			{
				lastMessageAt: job.cursorLastMessageAt,
				id: { gt: job.cursorThreadId },
			},
		];
	}

	const threads = await db.emailThread.findMany({
		where,
		orderBy: [{ lastMessageAt: "asc" }, { id: "asc" }],
		take: BRAIN.batchSize,
		select: {
			id: true,
			subject: true,
			lastMessageAt: true,
			companyId: true,
			contactId: true,
			dealId: true,
			bookingId: true,
			messages: {
				orderBy: { sentAt: "desc" },
				take: BRAIN.maxMessagesPerThread,
				select: {
					fromEmail: true,
					sentAt: true,
					snippet: true,
					body: true,
				},
			},
		},
	});

	if (threads.length === 0) {
		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "COMPLETED", completedAt: new Date() },
		});
		return { processed: 0, written: 0, conflicts: 0, finished: true };
	}

	const digests: ThreadDigest[] = threads.map((thread) => ({
		threadId: thread.id,
		subject: thread.subject,
		companyId: thread.companyId,
		contactId: thread.contactId,
		dealId: thread.dealId,
		bookingId: thread.bookingId,
		messages: thread.messages.map((message) => ({
			from: message.fromEmail,
			sentAt: message.sentAt,
			text: message.body ?? message.snippet ?? "",
		})),
	}));

	const digestById = new Map(
		digests.map((digest) => [digest.threadId, digest]),
	);

	console.warn("[brain-scan]", {
		event: "brain_scan_batch_started",
		jobId: job.id,
		threadCount: threads.length,
		cursorThreadId: job.cursorThreadId,
	});

	let extraction: ExtractionResult;
	try {
		extraction = await extract(digests);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.warn("[brain-scan]", {
			event: "brain_scan_batch_failed",
			jobId: job.id,
			threadCount: threads.length,
			reason,
		});
		await db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "FAILED", lastError: reason, completedAt: new Date() },
		});
		return { processed: 0, written: 0, conflicts: 0, finished: true, reason };
	}

	let written = 0;
	let conflicts = 0;

	for (const fact of extraction.facts) {
		const digest = digestById.get(fact.threadId);
		if (!digest) continue;

		const sourceAt = digest.messages[0]?.sentAt ?? null;
		const input: KnowledgeInput = {
			kind: fact.kind,
			subject: fact.subject,
			detail: fact.detail,
			sourceType: "GMAIL",
			sourceId: fact.threadId,
			sourceAt,
			confidence: fact.confidence,
			companyId: digest.companyId,
			contactId: digest.contactId,
			dealId: digest.dealId,
			bookingId: digest.bookingId,
		};

		if (await hasBrainKnowledge(input)) continue;

		if (CONFLICT_KINDS.has(fact.kind) && digest.companyId) {
			const existing = await currentKnowledge(db, {
				kind: fact.kind,
				companyId: digest.companyId,
				limit: 1,
			});
			const current = existing[0];

			if (current && current.subject !== fact.subject) {
				conflicts += 1;

				if (current.humanConfirmed) {
					const recorded = await recordBrainKnowledge({
						kind: "INFERENCE",
						subject: `Possible update to "${current.subject}": ${fact.subject}`,
						detail: fact.detail,
						sourceType: "GMAIL",
						sourceId: fact.threadId,
						sourceAt,
						confidence: fact.confidence,
						companyId: digest.companyId,
					});
					if (recorded) written += 1;
					continue;
				}

				if (sourceAt && current.sourceAt && sourceAt <= current.sourceAt) {
					continue;
				}

				await supersedeKnowledge(db, current.id, {
					kind: fact.kind,
					subject: fact.subject,
					detail: fact.detail,
					sourceType: "GMAIL",
					sourceId: fact.threadId,
					sourceAt,
					confidence: fact.confidence,
					companyId: digest.companyId,
				});
				written += 1;
				continue;
			}
		}

		if (await recordBrainKnowledge(input)) written += 1;
	}

	const last = threads[threads.length - 1];
	const exhausted = threads.length < BRAIN.batchSize;

	const progress: Prisma.BrainAnalysisJobUncheckedUpdateInput = {
		cursorLastMessageAt: last?.lastMessageAt ?? job.cursorLastMessageAt,
		cursorThreadId: last?.id ?? job.cursorThreadId,
		processedThreads: { increment: threads.length },
		knowledgeWritten: { increment: written },
		conflictsFound: { increment: conflicts },
		tokensInput: { increment: extraction.usage.inputTokens },
		tokensOutput: { increment: extraction.usage.outputTokens },
		modelUsed: extraction.usage.model,
		providerUsed: extraction.usage.provider,
	};

	if (exhausted) {
		progress.status = "COMPLETED";
		progress.completedAt = new Date();
	}

	await db.brainAnalysisJob.update({
		where: { id: job.id },
		data: progress,
	});

	console.warn("[brain-scan]", {
		event: "brain_scan_batch_completed",
		jobId: job.id,
		processed: threads.length,
		written,
		conflicts,
		exhausted,
		cursorThreadId: last?.id ?? job.cursorThreadId,
	});

	return {
		processed: threads.length,
		written,
		conflicts,
		finished: exhausted,
	};
}

async function recordBrainKnowledge(input: KnowledgeInput): Promise<boolean> {
	if (await hasBrainKnowledge(input)) return false;
	await recordKnowledge(db, input);
	return true;
}

async function hasBrainKnowledge(input: KnowledgeInput): Promise<boolean> {
	const existing = await db.businessKnowledge.findFirst({
		where: {
			kind: input.kind,
			subject: input.subject,
			detail: input.detail ?? null,
			sourceType: input.sourceType,
			sourceId: input.sourceId ?? null,
			companyId: input.companyId ?? null,
			contactId: input.contactId ?? null,
			dealId: input.dealId ?? null,
			bookingId: input.bookingId ?? null,
		},
		select: { id: true },
	});

	return existing !== null;
}
