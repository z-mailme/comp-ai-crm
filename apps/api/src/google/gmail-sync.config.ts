export const GMAIL_SYNC = {
	incremental: {
		maxMessagesPerTick: 120,
		historyPageSize: 500,
	},
	backfill: {
		defaultMaxMessages: 100,
		maxMessages: 500,
		pageSize: 100,
		queryMaxLength: 500,
	},
	historicalImport: {
		safeCandidateLimit: 500,
		leaseMs: 240_000,
		defaultRateLimitMs: 60_000,
		rateLimitBufferMs: 15_000,
		maxRetryAttempts: 6,
		retryBackoffMs: [30_000, 60_000, 120_000, 300_000, 600_000, 900_000],
		minSplitMs: 3_600_000,
	},
	send: {
		transactionTimeoutMs: 20_000,
	},
} as const;
