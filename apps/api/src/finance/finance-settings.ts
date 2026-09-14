import { z } from "zod";
import { FINANCE } from "./finance-config";

export const financeSettingsValue = z.object({
	defaultCurrency: z
		.string()
		.trim()
		.length(3)
		.default(FINANCE.documents.currency),
	taxEnabled: z.boolean().default(FINANCE.documents.taxEnabled),
	taxRateBasisPoints: z
		.number()
		.int()
		.min(0)
		.max(10_000)
		.default(FINANCE.documents.taxRateBasisPoints),
	depositBasisPoints: z
		.number()
		.int()
		.min(0)
		.max(10_000)
		.default(FINANCE.documents.depositBasisPoints),
	quoteValidityDays: z
		.number()
		.int()
		.min(1)
		.max(365)
		.default(FINANCE.documents.quoteValidityDays),
	invoiceDueDays: z
		.number()
		.int()
		.min(0)
		.max(365)
		.default(FINANCE.documents.invoiceDueDays),
	quotePrefix: z
		.string()
		.trim()
		.min(1)
		.max(12)
		.default(FINANCE.documents.quotePrefix),
	invoicePrefix: z
		.string()
		.trim()
		.min(1)
		.max(12)
		.default(FINANCE.documents.invoicePrefix),
});

export type FinanceSettingsValue = z.infer<typeof financeSettingsValue>;

export const DEFAULT_FINANCE_SETTINGS: FinanceSettingsValue = {
	defaultCurrency: FINANCE.documents.currency,
	taxEnabled: FINANCE.documents.taxEnabled,
	taxRateBasisPoints: FINANCE.documents.taxRateBasisPoints,
	depositBasisPoints: FINANCE.documents.depositBasisPoints,
	quoteValidityDays: FINANCE.documents.quoteValidityDays,
	invoiceDueDays: FINANCE.documents.invoiceDueDays,
	quotePrefix: FINANCE.documents.quotePrefix,
	invoicePrefix: FINANCE.documents.invoicePrefix,
};
