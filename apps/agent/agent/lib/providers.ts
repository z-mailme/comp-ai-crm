import "@crm/env/load";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	AI_PROVIDERS,
	type AiProvider,
	findProviderModel,
	providerById,
} from "@crm/validation/ai-providers";
import type { LanguageModel } from "ai";

export type ProviderStatus = {
	id: string;
	label: string;
	configured: boolean;
	models: readonly {
		id: string;
		label: string;
		contextWindowTokens: number;
		toolUse: boolean;
		reasoning: boolean;
	}[];
};

export function providerConfigured(provider: AiProvider): boolean {
	return Boolean(process.env[provider.envKey]?.trim());
}

export function providerStatuses(): readonly ProviderStatus[] {
	return AI_PROVIDERS.map((provider) => ({
		id: provider.id,
		label: provider.label,
		configured: providerConfigured(provider),
		models: provider.models.map((model) => ({
			id: model.id,
			label: model.label,
			contextWindowTokens: model.contextWindowTokens,
			toolUse: model.toolUse,
			reasoning: model.reasoning,
		})),
	}));
}

export function resolveDirectModel(selectionId: string): LanguageModel | null {
	const found = findProviderModel(selectionId);
	if (!found) return null;

	const apiKey = process.env[found.provider.envKey]?.trim();
	if (!apiKey) return null;

	const client = createOpenAICompatible({
		name: found.provider.id,
		baseURL: found.provider.baseURL,
		apiKey,
	});

	return client(found.model.id);
}

export async function testProviderConnection(
	providerId: string,
): Promise<{ ok: boolean; models: number; reason: string | null }> {
	const provider = providerById(providerId);
	if (!provider) {
		return {
			ok: false,
			models: 0,
			reason: `Unknown provider "${providerId}".`,
		};
	}

	const apiKey = process.env[provider.envKey]?.trim();
	if (!apiKey) {
		return {
			ok: false,
			models: 0,
			reason: `${provider.envKey} is not set on this install.`,
		};
	}

	try {
		const response = await fetch(`${provider.baseURL}/models`, {
			headers: { authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			return {
				ok: false,
				models: 0,
				reason: `${provider.label} answered HTTP ${response.status}.`,
			};
		}

		const body = (await response.json()) as { data?: unknown[] };
		return {
			ok: true,
			models: Array.isArray(body.data) ? body.data.length : 0,
			reason: null,
		};
	} catch (error) {
		return {
			ok: false,
			models: 0,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}
