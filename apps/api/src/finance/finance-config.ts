const MINUTE_MS = 60_000;

export const FINANCE = {
	operatorLabour: {
		currency: "ZAR",
		longThresholdMinutes: 5 * 60,
		shortRateCents: 30_000,
		longRateCents: 40_000,
		ruleKey: "operator-labour",
	},
	documents: {
		currency: "ZAR",
		quotePrefix: "Q",
		invoicePrefix: "INV",
		numberPad: 5,
	},
	ledgerAccounts: {
		cash: { code: "1000", name: "Cash", type: "ASSET" },
		receivables: { code: "1100", name: "Accounts receivable", type: "ASSET" },
		revenue: { code: "4000", name: "Revenue", type: "INCOME" },
		expenses: { code: "5000", name: "Expenses", type: "EXPENSE" },
	},
	weekDays: 7,
	maxEvidenceThreads: 5,
	noteMaxLength: 500,
} as const;

export { MINUTE_MS };
