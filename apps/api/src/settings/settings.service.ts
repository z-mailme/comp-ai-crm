import type { Db, Prisma } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	maskKey,
	readAgentModel,
	readArchiveRetentionDays,
	readContextDevKey,
	writeAgentModel,
	writeArchiveRetentionDays,
	writeContextDevKey,
} from "@crm/db/settings";
import { AI_PROVIDERS, findProviderModel } from "@crm/validation/ai-providers";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { ResearchKeyService } from "../agent/research-key.service";
import { BackfillService } from "../backfill/backfill.service";
import { InjectDatabase } from "../database/database.constants";
import { ModelCatalogService } from "./model-catalog.service";
import type {
	AgentModelSettings,
	AiProviderStatus,
	ArchiveRetentionSettings,
	CatalogModel,
	ModelCatalogResult,
	ResearchKeySettings,
} from "./settings.contracts";

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly catalog: ModelCatalogService,
		private readonly researchKeys: ResearchKeyService,
		private readonly backfill: BackfillService,
	) {}

	async agentModel(): Promise<AgentModelSettings> {
		const [model, row] = await Promise.all([
			readAgentModel(this.db),
			this.db.appSetting.findFirst({ select: { updatedAt: true } }),
		]);

		return {
			selectedId: model.isDefault ? null : model.id,
			effectiveId: model.id,
			defaultId: DEFAULT_AGENT_MODEL.id,
			effective: await this.findModel(model.id),
			updatedAt: row?.updatedAt.toISOString() ?? null,
		};
	}

	async setAgentModel(modelId: string | null): Promise<AgentModelSettings> {
		if (modelId === null) {
			await writeAgentModel(this.db, null);
			this.logger.log({ message: "Agent model reset to the default" });
			return this.agentModel();
		}

		const direct = findProviderModel(modelId);
		if (direct) {
			if (!process.env[direct.provider.envKey]?.trim()) {
				throw new BadRequestException(
					`${direct.provider.envKey} is not set on this install, so ${direct.model.label} cannot run directly. Add the key to the environment first.`,
				);
			}

			await writeAgentModel(this.db, {
				id: modelId,
				contextWindowTokens: direct.model.contextWindowTokens,
			});

			this.logger.log({
				message: "Agent model changed",
				modelId,
				provider: direct.provider.id,
			});

			return this.agentModel();
		}

		const models = await this.catalog.models();

		if (!models) {
			throw new BadRequestException(
				"Could not reach the AI Gateway to check that model. Try again in a moment.",
			);
		}

		const chosen = models.find((model) => model.id === modelId);

		if (!chosen) {
			throw new BadRequestException(
				`The AI Gateway does not serve a tool-using model called "${modelId}".`,
			);
		}

		await writeAgentModel(this.db, {
			id: chosen.id,
			contextWindowTokens: chosen.contextWindowTokens,
		});

		this.logger.log({ message: "Agent model changed", modelId: chosen.id });

		return this.agentModel();
	}

	async modelCatalog(): Promise<ModelCatalogResult> {
		const models = await this.catalog.models();
		return {
			models: [
				...(models ?? []).map((model) => ({
					...model,
					source: "gateway" as const,
					keyConfigured: true,
				})),
				...directCatalogModels(),
			],
			available: models !== null,
		};
	}

	async providers(): Promise<AiProviderStatus[]> {
		const tests = await this.db.agentTask.findMany({
			where: { kind: "provider-test" },
			orderBy: { createdAt: "desc" },
			take: 20,
			select: { payload: true, outcome: true, finishedAt: true },
		});

		return AI_PROVIDERS.map((provider) => {
			const last = tests.find(
				(task) => providerOfPayload(task.payload) === provider.id,
			);

			return {
				id: provider.id,
				label: provider.label,
				envKey: provider.envKey,
				configured: Boolean(process.env[provider.envKey]?.trim()),
				models: provider.models.map((model) => ({
					id: model.id,
					label: model.label,
					contextWindowTokens: model.contextWindowTokens,
					toolUse: model.toolUse,
					reasoning: model.reasoning,
				})),
				lastTest: last
					? {
							outcome: last.outcome,
							finishedAt: last.finishedAt?.toISOString() ?? null,
							pending: last.finishedAt === null,
						}
					: null,
			};
		});
	}

	private async findModel(id: string): Promise<CatalogModel | null> {
		const direct = directCatalogModels().find((model) => model.id === id);
		if (direct) return direct;

		const gateway = await this.catalog.find(id);
		return gateway
			? { ...gateway, source: "gateway", keyConfigured: true }
			: null;
	}

	async researchKey(): Promise<ResearchKeySettings> {
		const key = await readContextDevKey(this.db);

		return { configured: key !== null, hint: key ? maskKey(key) : null };
	}

	async setResearchKey(apiKey: string): Promise<ResearchKeySettings> {
		const check = await this.researchKeys.verify(apiKey);

		if (check.outcome === "invalid") {
			throw new BadRequestException(check.reason);
		}

		await writeContextDevKey(this.db, apiKey);

		this.logger.log({
			message: "Context key saved",
			verified: check.outcome === "valid",
		});

		// Every company added while there was no key is still PENDING, because a
		// brand task with nowhere to look leaves the record alone. The sign-in
		// sweep would find them, but the person who just fixed it is standing
		// here — so pick the work up now rather than on their next sign-in.
		void this.backfill
			.run("companies")
			.then(({ queued, remaining }) => {
				if (queued > 0) {
					this.logger.log({
						message: "Queued the research that was waiting on a key",
						queued,
						remaining,
					});
				}
			})
			.catch((cause: unknown) => {
				this.logger.warn(
					{ message: "Could not queue the waiting research" },
					cause instanceof Error ? cause.stack : String(cause),
				);
			});

		return this.researchKey();
	}

	async archiveRetention(): Promise<ArchiveRetentionSettings> {
		return { days: await readArchiveRetentionDays(this.db) };
	}

	async setArchiveRetention(days: number): Promise<ArchiveRetentionSettings> {
		const saved = await writeArchiveRetentionDays(this.db, days);

		this.logger.log({
			message: "Archive retention changed",
			days: saved,
		});

		return { days: saved };
	}
}

function directCatalogModels(): CatalogModel[] {
	return AI_PROVIDERS.flatMap((provider) =>
		provider.models.map((model) => ({
			id: `${provider.id}/${model.id}`,
			name: model.label,
			provider: `${provider.label} (direct)`,
			contextWindowTokens: model.contextWindowTokens,
			pricing: null,
			source: "direct" as const,
			keyConfigured: Boolean(process.env[provider.envKey]?.trim()),
		})),
	);
}

function providerOfPayload(payload: Prisma.JsonValue): string | null {
	const parsed = providerTestPayload.safeParse(payload);
	return parsed.success ? parsed.data.provider : null;
}

const providerTestPayload = z.object({ provider: z.string() });
