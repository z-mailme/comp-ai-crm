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
} as const;
