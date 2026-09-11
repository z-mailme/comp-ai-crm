const MINUTE_MS = 60_000;

export const GOOGLE_ANALYTICS = {
	adminBaseUrl: "https://analyticsadmin.googleapis.com/v1beta",
	dataBaseUrl: "https://analyticsdata.googleapis.com/v1beta",
	reportCacheTtlMs: 15 * MINUTE_MS,
	accountSummaryPageSize: 200,
	maxAccountSummaryPages: 5,
	dailyRowLimit: 120,
	breakdownRowLimit: 10,
	windows: [7, 28, 90],
	defaultWindowDays: 28,
} as const;
