import { z } from "zod";

export const BRAIN = {
	batchSize: 10,
	maxBodyChars: 2_000,
	maxSnippetChars: 280,
	maxMessagesPerThread: 4,
	fetchTimeoutMs: 60_000,
} as const;
