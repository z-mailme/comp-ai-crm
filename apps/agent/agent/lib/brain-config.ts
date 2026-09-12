export const BRAIN = {
	batchSize: 10,
	maxBodyChars: 2_000,
	maxSnippetChars: 280,
	maxMessagesPerThread: 4,
	modelCallTimeoutMs: 60_000,
	repairAttempts: 1,
	diagnosticIssueLimit: 10,
	diagnosticMessageChars: 160,
} as const;
