import { z } from "zod";

export const aiProviderModel = z.object({
	id: z.string(),
	label: z.string(),
	contextWindowTokens: z.number().int().positive(),
	toolUse: z.boolean(),
	reasoning: z.boolean(),
	fixedTemperature: z.number().optional(),
});

export type AiProviderModel = z.infer<typeof aiProviderModel>;

export const aiProvider = z.object({
	id: z.enum(["deepseek", "moonshot"]),
	label: z.string(),
	envKey: z.enum(["DEEPSEEK_API_KEY", "MOONSHOT_API_KEY"]),
	baseURL: z.string(),
	models: z.array(aiProviderModel),
});

export type AiProvider = z.infer<typeof aiProvider>;

export const AI_PROVIDERS = [
	{
		id: "deepseek",
		label: "DeepSeek",
		envKey: "DEEPSEEK_API_KEY",
		baseURL: "https://api.deepseek.com/v1",
		models: [
			{
				id: "deepseek-v4-flash",
				label: "DeepSeek V4 Flash",
				contextWindowTokens: 1_000_000,
				toolUse: true,
				reasoning: true,
			},
			{
				id: "deepseek-v4-pro",
				label: "DeepSeek V4 Pro",
				contextWindowTokens: 1_000_000,
				toolUse: true,
				reasoning: true,
			},
		],
	},
	{
		id: "moonshot",
		label: "Kimi (Moonshot)",
		envKey: "MOONSHOT_API_KEY",
		baseURL: "https://api.moonshot.ai/v1",
		models: [
			{
				id: "kimi-k2.6",
				label: "Kimi K2.6",
				contextWindowTokens: 256_000,
				toolUse: true,
				reasoning: false,
				fixedTemperature: 1,
			},
			{
				id: "kimi-k2.5",
				label: "Kimi K2.5",
				contextWindowTokens: 256_000,
				toolUse: true,
				reasoning: false,
			},
		],
	},
] as const satisfies readonly AiProvider[];

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export function providerById(id: string): AiProvider | null {
	return AI_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function findProviderModel(
	selectionId: string,
): { provider: AiProvider; model: AiProviderModel } | null {
	const [providerId, ...rest] = selectionId.split("/");
	const modelId = rest.join("/");
	if (!providerId || !modelId) return null;

	const provider = providerById(providerId);
	if (!provider) return null;

	const model = provider.models.find((entry) => entry.id === modelId);
	return model ? { provider, model } : null;
}
