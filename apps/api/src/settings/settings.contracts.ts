import {
	MAX_ARCHIVE_RETENTION_DAYS,
	MIN_ARCHIVE_RETENTION_DAYS,
} from "@crm/db/settings";
import { z } from "zod";

export const catalogModelOutput = z.object({
	id: z.string(),
	name: z.string(),
	provider: z.string(),
	contextWindowTokens: z.number(),
	pricing: z.object({ input: z.number(), output: z.number() }).nullable(),
	source: z.enum(["gateway", "direct"]),
	keyConfigured: z.boolean(),
});

export type CatalogModel = z.infer<typeof catalogModelOutput>;

export const agentModelOutput = z.object({
	selectedId: z.string().nullable(),
	effectiveId: z.string(),
	defaultId: z.string(),
	effective: catalogModelOutput.nullable(),
	updatedAt: z.string().nullable(),
});

export type AgentModelSettings = z.infer<typeof agentModelOutput>;

export const modelCatalogOutput = z.object({
	models: z.array(catalogModelOutput),
	available: z.boolean(),
});

export type ModelCatalogResult = z.infer<typeof modelCatalogOutput>;

export const aiProviderStatusOutput = z.object({
	id: z.string(),
	label: z.string(),
	envKey: z.string(),
	configured: z.boolean(),
	models: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			contextWindowTokens: z.number(),
			toolUse: z.boolean(),
			reasoning: z.boolean(),
		}),
	),
	lastTest: z
		.object({
			outcome: z.string().nullable(),
			finishedAt: z.string().nullable(),
			pending: z.boolean(),
		})
		.nullable(),
});

export type AiProviderStatus = z.infer<typeof aiProviderStatusOutput>;

export const testProviderInput = z.object({
	provider: z.enum(["deepseek", "moonshot"]),
});

export type TestProviderInput = z.infer<typeof testProviderInput>;

export const testProviderOutput = z.object({
	queued: z.boolean(),
});

export type TestProviderOutput = z.infer<typeof testProviderOutput>;

export const researchKeyOutput = z.object({
	configured: z.boolean(),
	hint: z.string().nullable(),
});

export type ResearchKeySettings = z.infer<typeof researchKeyOutput>;

export const archiveRetentionOutput = z.object({
	days: z.number(),
});

export type ArchiveRetentionSettings = z.infer<typeof archiveRetentionOutput>;

export const popAutoAcknowledgeOutput = z.object({
	enabled: z.boolean(),
	killSwitch: z.boolean(),
});

export type PopAutoAcknowledgeSettings = z.infer<
	typeof popAutoAcknowledgeOutput
>;

export const setPopAutoAcknowledgeInput = z.object({
	enabled: z.boolean(),
});

export type SetPopAutoAcknowledgeInput = z.infer<
	typeof setPopAutoAcknowledgeInput
>;

export const setAgentModelInput = z.object({
	modelId: z.string().trim().min(1).max(200).nullable(),
});

export type SetAgentModelInput = z.infer<typeof setAgentModelInput>;

export const setResearchKeyInput = z.object({
	apiKey: z
		.string()
		.trim()
		.min(8, "That does not look like a Context API key — it is too short.")
		.max(500, "That does not look like a Context API key — it is too long.")
		.refine(
			(value) => !/\s/.test(value),
			"An API key has no spaces in it. Paste the whole key on its own.",
		),
});

export type SetResearchKeyInput = z.infer<typeof setResearchKeyInput>;

export const setArchiveRetentionDaysInput = z.object({
	days: z
		.number()
		.int()
		.min(
			MIN_ARCHIVE_RETENTION_DAYS,
			`Retention has to be at least ${MIN_ARCHIVE_RETENTION_DAYS} day.`,
		)
		.max(
			MAX_ARCHIVE_RETENTION_DAYS,
			`Retention cannot be longer than ${MAX_ARCHIVE_RETENTION_DAYS} days.`,
		),
});

export type SetArchiveRetentionDaysInput = z.infer<
	typeof setArchiveRetentionDaysInput
>;
