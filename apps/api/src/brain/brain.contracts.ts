import { z } from "zod";

export const brainJobOutput = z
	.object({
		id: z.string(),
		source: z.string(),
		status: z.enum([
			"PLANNING",
			"RUNNING",
			"PAUSED",
			"COMPLETED",
			"FAILED",
			"CANCELLED",
		]),
		totalThreads: z.number(),
		processedThreads: z.number(),
		knowledgeWritten: z.number(),
		conflictsFound: z.number(),
		tokensInput: z.number(),
		tokensOutput: z.number(),
		modelUsed: z.string().nullable(),
		providerUsed: z.string().nullable(),
		lastError: z.string().nullable(),
		startedAt: z.string().nullable(),
		completedAt: z.string().nullable(),
	})
	.nullable();

export type BrainJobOutput = z.infer<typeof brainJobOutput>;

export const brainKnowledgeOutput = z.object({
	id: z.string(),
	kind: z.string(),
	subject: z.string(),
	detail: z.string().nullable(),
	sourceType: z.string(),
	sourceAt: z.string().nullable(),
	confidence: z.number(),
	aiGenerated: z.boolean(),
	humanConfirmed: z.boolean(),
	validFrom: z.string(),
	companyName: z.string().nullable(),
	contactName: z.string().nullable(),
});

export const brainKnowledgeQueryInput = z.object({
	kind: z.string().trim().min(1).max(40).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export type BrainKnowledgeQueryInput = z.infer<typeof brainKnowledgeQueryInput>;
