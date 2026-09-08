import { describe, expect, it } from "bun:test";
import {
	findProviderModel,
	providerById,
} from "@crm/validation/ai-providers";
import { providerStatuses, resolveDirectModel } from "../agent/lib/providers";

describe("AI provider registry", () => {
	it("resolves a direct model id to its provider and model", () => {
		const found = findProviderModel("deepseek/deepseek-v4-flash");
		expect(found?.provider.id).toBe("deepseek");
		expect(found?.model.id).toBe("deepseek-v4-flash");
		expect(found?.model.toolUse).toBe(true);

		const kimi = findProviderModel("moonshot/kimi-k2.6");
		expect(kimi?.provider.id).toBe("moonshot");
		expect(kimi?.model.fixedTemperature).toBe(1);
	});

	it("returns null for gateway ids and unknown providers", () => {
		expect(findProviderModel("zai/glm-5.2-fast")).toBeNull();
		expect(findProviderModel("unknown/model")).toBeNull();
		expect(findProviderModel("deepseek/not-a-model")).toBeNull();
	});

	it("reports configuration state from the environment", () => {
		const statuses = providerStatuses();
		expect(statuses.map((status) => status.id).sort()).toEqual([
			"deepseek",
			"moonshot",
		]);

		const deepseek = providerById("deepseek");
		expect(deepseek?.baseURL).toBe("https://api.deepseek.com/v1");
	});

	it("does not build a direct model without the provider key", () => {
		const savedDeepseek = process.env.DEEPSEEK_API_KEY;
		const savedMoonshot = process.env.MOONSHOT_API_KEY;
		delete process.env.DEEPSEEK_API_KEY;
		delete process.env.MOONSHOT_API_KEY;

		try {
			expect(resolveDirectModel("deepseek/deepseek-v4-flash")).toBeNull();
			expect(resolveDirectModel("zai/glm-5.2-fast")).toBeNull();
		} finally {
			if (savedDeepseek) process.env.DEEPSEEK_API_KEY = savedDeepseek;
			if (savedMoonshot) process.env.MOONSHOT_API_KEY = savedMoonshot;
		}
	});

	it("builds an OpenAI-compatible model when the key is present", () => {
		const saved = process.env.DEEPSEEK_API_KEY;
		process.env.DEEPSEEK_API_KEY = "test-key";

		try {
			const model = resolveDirectModel("deepseek/deepseek-v4-flash");
			expect(model).not.toBeNull();
		} finally {
			if (saved) {
				process.env.DEEPSEEK_API_KEY = saved;
			} else {
				delete process.env.DEEPSEEK_API_KEY;
			}
		}
	});
});
