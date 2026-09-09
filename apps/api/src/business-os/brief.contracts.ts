import { z } from "zod";

export const briefDailyOutput = z.object({
	generatedAt: z.string(),
	eventsToday: z.number(),
	newEnquiries: z.number(),
	quotesToFollowUp: z.number(),
	depositsOutstanding: z.number(),
	popReceived: z.number(),
	bookingsMissingDetails: z.number(),
	unreadMessages: z.number(),
	acknowledgementsSent: z.number(),
	agentActionsPending: z.number(),
});

export type BriefDailyOutput = z.infer<typeof briefDailyOutput>;

export const briefExceptionOutput = z.object({
	id: z.string(),
	severity: z.enum(["INFO", "ATTENTION", "URGENT"]),
	type: z.string(),
	title: z.string(),
	detail: z.string().nullable(),
	suggestedAction: z.string().nullable(),
	contactId: z.string().nullable(),
	companyId: z.string().nullable(),
	dealId: z.string().nullable(),
	bookingId: z.string().nullable(),
	conversationId: z.string().nullable(),
});

export type BriefExceptionOutput = z.infer<typeof briefExceptionOutput>;

export const briefExceptionsOutput = z.object({
	exceptions: z.array(briefExceptionOutput),
});

export type BriefExceptionsOutput = z.infer<typeof briefExceptionsOutput>;
