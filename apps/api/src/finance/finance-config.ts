const MINUTE_MS = 60_000;

export const FINANCE = {
	operatorLabour: {
		currency: "ZAR",
		longThresholdMinutes: 5 * 60,
		shortRateCents: 30_000,
		longRateCents: 40_000,
		ruleKey: "operator-labour",
	},
	settings: {
		ruleKey: "finance-settings",
	},
	documents: {
		currency: "ZAR",
		quotePrefix: "Q",
		invoicePrefix: "INV",
		numberPad: 5,
		quoteValidityDays: 14,
		invoiceDueDays: 7,
		taxEnabled: false,
		taxRateBasisPoints: 0,
		depositBasisPoints: 5_000,
	},
	ledgerAccounts: {
		bank: { code: "1000", name: "Bank", type: "ASSET" },
		cash: { code: "1010", name: "Cash", type: "ASSET" },
		receivables: { code: "1100", name: "Accounts receivable", type: "ASSET" },
		deposits: { code: "2100", name: "Customer deposits", type: "LIABILITY" },
		payables: { code: "2200", name: "Accounts payable", type: "LIABILITY" },
		revenue: { code: "4000", name: "Other revenue", type: "INCOME" },
		booth360Revenue: {
			code: "4010",
			name: "360 Booth revenue",
			type: "INCOME",
		},
		printingBoothRevenue: {
			code: "4020",
			name: "Printing Booth revenue",
			type: "INCOME",
		},
		photographyRevenue: {
			code: "4030",
			name: "Photography revenue",
			type: "INCOME",
		},
		travelFeeRevenue: {
			code: "4040",
			name: "Travel fee revenue",
			type: "INCOME",
		},
		expenses: { code: "5000", name: "Other expense", type: "EXPENSE" },
		operatorLabourExpense: {
			code: "5010",
			name: "Operator labour",
			type: "EXPENSE",
		},
		travelExpense: { code: "5020", name: "Travel", type: "EXPENSE" },
		fuelExpense: { code: "5030", name: "Fuel", type: "EXPENSE" },
		printingExpense: { code: "5040", name: "Printing", type: "EXPENSE" },
		marketingExpense: { code: "5050", name: "Marketing", type: "EXPENSE" },
		softwareExpense: { code: "5060", name: "Software", type: "EXPENSE" },
		equipmentExpense: { code: "5070", name: "Equipment", type: "EXPENSE" },
	},
	weekDays: 7,
	maxEvidenceThreads: 5,
	noteMaxLength: 500,
} as const;

export { MINUTE_MS };
