import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	agentModelOutput,
	aiProviderStatusOutput,
	archiveRetentionOutput,
	modelCatalogOutput,
	researchKeyOutput,
	setAgentModelInput,
	setArchiveRetentionDaysInput,
	setResearchKeyInput,
	testProviderInput,
	testProviderOutput,
} from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
@UseMiddlewares(AuthMiddleware)
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	@Query({
		output: agentModelOutput,
		meta: restMeta("GET", "/settings/agent-model", ["Settings"]),
	})
	async agentModel() {
		return this.settings.agentModel();
	}

	@Query({
		output: modelCatalogOutput,
		meta: restMeta("GET", "/settings/model-catalog", ["Settings"]),
	})
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Query({
		output: aiProviderStatusOutput.array(),
		meta: restMeta("GET", "/settings/providers", ["Settings"]),
	})
	async providers() {
		return this.settings.providers();
	}

	@Mutation({
		input: testProviderInput,
		output: testProviderOutput,
		meta: restMeta("POST", "/settings/providers/test", ["Settings"]),
	})
	async testProvider(@Input() input: z.infer<typeof testProviderInput>) {
		return { queued: await this.agent.providerTest(input.provider) };
	}

	@Mutation({
		input: setAgentModelInput,
		output: agentModelOutput,
		meta: restMeta("PATCH", "/settings/agent-model", ["Settings"]),
	})
	async setAgentModel(@Input() input: z.infer<typeof setAgentModelInput>) {
		return this.settings.setAgentModel(input.modelId);
	}

	@Query({
		output: researchKeyOutput,
		meta: restMeta("GET", "/settings/research-key", ["Settings"]),
	})
	async researchKey() {
		return this.settings.researchKey();
	}

	@Mutation({
		input: setResearchKeyInput,
		output: researchKeyOutput,
		meta: restMeta("PATCH", "/settings/research-key", ["Settings"]),
	})
	async setResearchKey(@Input() input: z.infer<typeof setResearchKeyInput>) {
		return this.settings.setResearchKey(input.apiKey);
	}

	@Query({
		output: archiveRetentionOutput,
		meta: restMeta("GET", "/settings/archive-retention", ["Settings"]),
	})
	async archiveRetention() {
		return this.settings.archiveRetention();
	}

	@Mutation({
		input: setArchiveRetentionDaysInput,
		output: archiveRetentionOutput,
		meta: restMeta("PATCH", "/settings/archive-retention", ["Settings"]),
	})
	async setArchiveRetention(
		@Input() input: z.infer<typeof setArchiveRetentionDaysInput>,
	) {
		return this.settings.setArchiveRetention(input.days);
	}
}
