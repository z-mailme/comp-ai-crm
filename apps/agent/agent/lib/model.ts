import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import type { LanguageModel } from "ai";
import { resolveDirectModel } from "./providers";

export type ModelSelection =
	| { gatewayId: string; modelContextWindowTokens: number }
	| {
			directModel: LanguageModel;
			directModelId: string;
			modelContextWindowTokens: number;
	  };

export type EveModelSelection = {
	model: string | LanguageModel;
	modelContextWindowTokens: number;
};

export async function eveSelectedModel(): Promise<EveModelSelection | null> {
	const selection = await selectedModel();
	if (!selection) return null;

	if ("gatewayId" in selection) {
		return {
			model: selection.gatewayId,
			modelContextWindowTokens: selection.modelContextWindowTokens,
		};
	}

	return {
		model: selection.directModel,
		modelContextWindowTokens: selection.modelContextWindowTokens,
	};
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		const direct = resolveDirectModel(setting.id);

		if (direct) {
			return {
				directModel: direct,
				directModelId: setting.id,
				modelContextWindowTokens: setting.contextWindowTokens,
			};
		}

		return {
			gatewayId: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}
