import { z } from "zod";
import { GOOGLE_ANALYTICS } from "./analytics.constants";

const gaWindowDays = z
	.number()
	.int()
	.refine(
		(value): value is 7 | 28 | 90 =>
			(GOOGLE_ANALYTICS.windows as readonly number[]).includes(value),
		{ message: "Window must be 7, 28 or 90 days." },
	);

export const gaWindowInput = z
	.object({
		days: gaWindowDays.default(GOOGLE_ANALYTICS.defaultWindowDays),
	})
	.optional()
	.default({ days: GOOGLE_ANALYTICS.defaultWindowDays });

export const gaPropertyRefOutput = z.object({
	id: z.string(),
	name: z.string().nullable(),
});

export const gaStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	scopeGranted: z.boolean(),
	property: gaPropertyRefOutput.nullable(),
});

export const gaPropertyOutput = z.object({
	id: z.string(),
	name: z.string(),
	accountName: z.string(),
});

export const gaPropertiesOutput = z.object({
	properties: z.array(gaPropertyOutput),
});

export const gaPropertyId = z
	.string()
	.trim()
	.transform((value) => value.replace(/^properties\//i, ""))
	.refine((value) => /^\d{1,20}$/.test(value), {
		message: "A GA4 property id is a number, for example 123456789.",
	});

export const setGaPropertyInput = z.object({
	property: z
		.object({
			id: gaPropertyId,
			name: z.string().trim().min(1).max(200).optional(),
		})
		.nullable(),
});

const gaSummaryOutput = z.object({
	users: z.number(),
	activeUsers: z.number(),
	sessions: z.number(),
	engagedSessions: z.number(),
	engagementRate: z.number().nullable(),
	views: z.number(),
	eventCount: z.number(),
	keyEvents: z.number(),
	avgEngagementTimeSeconds: z.number().nullable(),
});

export const gaReportOkOutput = z.object({
	state: z.literal("ok"),
	windowDays: z.number(),
	property: gaPropertyRefOutput,
	generatedAt: z.string(),
	summary: gaSummaryOutput,
	daily: z.array(
		z.object({
			date: z.string(),
			users: z.number(),
			sessions: z.number(),
			views: z.number(),
		}),
	),
	sources: z.array(
		z.object({
			source: z.string(),
			medium: z.string(),
			users: z.number(),
			sessions: z.number(),
		}),
	),
	pages: z.array(
		z.object({
			path: z.string(),
			views: z.number(),
			users: z.number(),
		}),
	),
	devices: z.array(
		z.object({
			category: z.string(),
			users: z.number(),
		}),
	),
	countries: z.array(
		z.object({
			country: z.string(),
			users: z.number(),
		}),
	),
});

export const gaReportOutput = z.discriminatedUnion("state", [
	z.object({ state: z.literal("unavailable") }),
	z.object({ state: z.literal("disconnected") }),
	z.object({ state: z.literal("permission-required") }),
	z.object({ state: z.literal("no-property") }),
	gaReportOkOutput,
]);

export type GaStatusOutput = z.infer<typeof gaStatusOutput>;
export type GaPropertiesOutput = z.infer<typeof gaPropertiesOutput>;
export type GaReportOkOutput = z.infer<typeof gaReportOkOutput>;
export type GaReportOutput = z.infer<typeof gaReportOutput>;
export type SetGaPropertyInput = z.infer<typeof setGaPropertyInput>;
