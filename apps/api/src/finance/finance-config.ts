const MINUTE_MS = 60_000;

export const FINANCE = {
	operatorLabour: {
		currency: "ZAR",
		longThresholdMinutes: 5 * 60,
		shortRateCents: 30_000,
		longRateCents: 40_000,
	},
	weekDays: 7,
	maxEvidenceThreads: 5,
	noteMaxLength: 500,
} as const;

export { MINUTE_MS };
