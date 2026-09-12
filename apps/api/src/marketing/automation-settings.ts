import { MarketingAutomationMode, type Prisma } from "@crm/db";
import { z } from "zod";
import { MARKETING_AUTOMATION } from "./marketing-config";

export const marketingAutomationSettings = z.object({
	mode: z
		.nativeEnum(MarketingAutomationMode)
		.default(MarketingAutomationMode.APPROVAL_REQUIRED),
	mediaCooldownDays: z
		.number()
		.int()
		.min(0)
		.max(90)
		.default(MARKETING_AUTOMATION.mediaCooldownDays),
	autopilotEnabled: z.boolean().default(false),
});

export type MarketingAutomationSettings = z.infer<
	typeof marketingAutomationSettings
>;

export const unitSettingsEnvelope = z.looseObject({
	marketingAutomation: marketingAutomationSettings.partial().optional(),
});

export type UnitSettingsEnvelope = z.infer<typeof unitSettingsEnvelope>;

export const DEFAULT_AUTOMATION_SETTINGS: MarketingAutomationSettings = {
	mode: MarketingAutomationMode.APPROVAL_REQUIRED,
	mediaCooldownDays: MARKETING_AUTOMATION.mediaCooldownDays,
	autopilotEnabled: false,
};

export function parseAutomationSettings(
	value: Prisma.JsonValue | undefined,
): MarketingAutomationSettings {
	const parsed = unitSettingsEnvelope.safeParse(value ?? {});
	if (!parsed.success) return DEFAULT_AUTOMATION_SETTINGS;
	return marketingAutomationSettings.parse(
		parsed.data.marketingAutomation ?? {},
	);
}

export function parseUnitSettings(
	value: Prisma.JsonValue | undefined,
): UnitSettingsEnvelope {
	const parsed = unitSettingsEnvelope.safeParse(value ?? {});
	return parsed.success ? parsed.data : {};
}
