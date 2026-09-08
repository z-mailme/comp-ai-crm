import { z } from "zod";
import { GMAIL_SYNC } from "./gmail-sync.config";

const queryDate = z
	.string()
	.trim()
	.min(1)
	.refine((value) => !Number.isNaN(new Date(value).getTime()), {
		message: "Date values must parse as dates.",
	})
	.transform((value) => new Date(value));

const queryBoolean = z
	.enum(["true", "false"])
	.default("true")
	.transform((value) => value === "true");

export const gmailBackfillInput = z
	.object({
		userId: z.string().trim().min(1).max(200),
		after: queryDate,
		before: queryDate,
		q: z
			.string()
			.trim()
			.min(1)
			.max(GMAIL_SYNC.backfill.queryMaxLength)
			.optional(),
		max: z.coerce
			.number()
			.int()
			.min(1)
			.max(GMAIL_SYNC.backfill.maxMessages)
			.default(GMAIL_SYNC.backfill.defaultMaxMessages),
		dryRun: queryBoolean,
	})
	.refine((input) => input.after < input.before, {
		message: "The after date must be before the before date.",
		path: ["before"],
	});

export type GmailBackfillTraceContext = {
	historicalImportJobId?: string;
	historicalImportChunkId?: string;
};

export type GmailBackfillInput = z.infer<typeof gmailBackfillInput> &
	GmailBackfillTraceContext;
