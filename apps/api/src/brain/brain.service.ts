import type { Db } from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	BrainJobOutput,
	BrainKnowledgeQueryInput,
} from "./brain.contracts";

const ACTIVE_STATUSES = ["PLANNING", "RUNNING", "PAUSED"] as const;

@Injectable()
export class BrainService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async latest(userId: string): Promise<BrainJobOutput> {
		const job = await this.db.brainAnalysisJob.findFirst({
			where: { userId, source: "gmail" },
			orderBy: { createdAt: "desc" },
		});

		return job ? serializeJob(job) : null;
	}

	async start(userId: string): Promise<BrainJobOutput> {
		const active = await this.db.brainAnalysisJob.findFirst({
			where: { userId, source: "gmail", status: { in: [...ACTIVE_STATUSES] } },
		});

		if (active) {
			throw new BadRequestException(
				"A Business Brain analysis is already active. Pause or finish it first.",
			);
		}

		const job = await this.db.brainAnalysisJob.create({
			data: { userId, source: "gmail" },
		});

		await this.agent.brainScanRequested(job.id);

		return serializeJob(job);
	}

	async pause(userId: string): Promise<BrainJobOutput> {
		const job = await this.activeJob(userId);

		const updated = await this.db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "PAUSED" },
		});

		return serializeJob(updated);
	}

	async resume(userId: string): Promise<BrainJobOutput> {
		const job = await this.activeJob(userId);

		if (job.status !== "PAUSED") {
			throw new BadRequestException("Only a paused analysis can resume.");
		}

		const updated = await this.db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "RUNNING" },
		});

		await this.agent.brainScanRequested(job.id);

		return serializeJob(updated);
	}

	async cancel(userId: string): Promise<BrainJobOutput> {
		const job = await this.activeJob(userId);

		const updated = await this.db.brainAnalysisJob.update({
			where: { id: job.id },
			data: { status: "CANCELLED", completedAt: new Date() },
		});

		return serializeJob(updated);
	}

	async knowledge(input: BrainKnowledgeQueryInput) {
		const rows = await this.db.businessKnowledge.findMany({
			where: {
				kind: input.kind as never,
				supersededById: null,
			},
			orderBy: [{ humanConfirmed: "desc" }, { extractedAt: "desc" }],
			take: input.limit,
			select: {
				id: true,
				kind: true,
				subject: true,
				detail: true,
				sourceType: true,
				sourceAt: true,
				confidence: true,
				aiGenerated: true,
				humanConfirmed: true,
				validFrom: true,
				company: { select: { name: true } },
				contact: { select: { firstName: true, lastName: true } },
			},
		});

		return rows.map((row) => ({
			id: row.id,
			kind: row.kind,
			subject: row.subject,
			detail: row.detail,
			sourceType: row.sourceType,
			sourceAt: row.sourceAt?.toISOString() ?? null,
			confidence: row.confidence,
			aiGenerated: row.aiGenerated,
			humanConfirmed: row.humanConfirmed,
			validFrom: row.validFrom.toISOString(),
			companyName: row.company?.name ?? null,
			contactName: row.contact
				? [row.contact.firstName, row.contact.lastName]
						.filter(Boolean)
						.join(" ")
				: null,
		}));
	}

	private async activeJob(userId: string) {
		const job = await this.db.brainAnalysisJob.findFirst({
			where: { userId, source: "gmail", status: { in: [...ACTIVE_STATUSES] } },
			orderBy: { createdAt: "desc" },
		});

		if (!job) {
			throw new BadRequestException("No active Business Brain analysis.");
		}

		return job;
	}
}

function serializeJob(job: {
	id: string;
	source: string;
	status: string;
	totalThreads: number;
	processedThreads: number;
	knowledgeWritten: number;
	conflictsFound: number;
	tokensInput: number;
	tokensOutput: number;
	modelUsed: string | null;
	providerUsed: string | null;
	lastError: string | null;
	startedAt: Date | null;
	completedAt: Date | null;
}): NonNullable<BrainJobOutput> {
	return {
		id: job.id,
		source: job.source,
		status: job.status as NonNullable<BrainJobOutput>["status"],
		totalThreads: job.totalThreads,
		processedThreads: job.processedThreads,
		knowledgeWritten: job.knowledgeWritten,
		conflictsFound: job.conflictsFound,
		tokensInput: job.tokensInput,
		tokensOutput: job.tokensOutput,
		modelUsed: job.modelUsed,
		providerUsed: job.providerUsed,
		lastError: job.lastError,
		startedAt: job.startedAt?.toISOString() ?? null,
		completedAt: job.completedAt?.toISOString() ?? null,
	};
}
