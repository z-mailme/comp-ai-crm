import { createHash } from "node:crypto";
import type { Db, Prisma } from "@crm/db";
import {
	BookingStatus,
	ExpenseCategory,
	ExpenseSource,
	ExpenseStatus,
	FinanceAuditAction,
	FinanceDocumentStatus,
	FinanceLedgerAccountType,
	FinanceLedgerEntrySource,
	InvoiceLifecycleStatus,
	PaymentRecordStatus,
	PaymentStatus,
} from "@crm/db/enums";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	type BusinessContext,
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { DAY_MS } from "../business-os/business-os.config";
import {
	bookingScope,
	directBusinessUnitScope,
} from "../business-os/business-os.service";
import { toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type AccountingOutput,
	type ExpenseEntryOutput,
	type ExpenseEvidence,
	type FinanceDashboardOutput,
	type FinanceDocumentOutput,
	type FinanceSettingsOutput,
	type FinanceWeekOutput,
	type FinanceWeekRowOutput,
	type InvoiceListOutput,
	type InvoiceMutationOutput,
	type PaymentListOutput,
	type PaymentMutationOutput,
	parseExpenseEvidence,
	type QuoteListOutput,
	type QuoteMutationOutput,
} from "./finance.contracts";
import { FINANCE } from "./finance-config";
import {
	type FinanceDocumentLine,
	type FinanceDocumentPdfInput,
	money,
	renderFinanceDocumentPdf,
} from "./finance-document";
import {
	DEFAULT_FINANCE_SETTINGS,
	type FinanceSettingsValue,
	financeSettingsValue,
} from "./finance-settings";
import {
	bookingDurationMinutes,
	DEFAULT_OPERATOR_LABOUR_RULE,
	type OperatorLabourRule,
	operatorCountOf,
	operatorLabourCostCents,
	operatorLabourRuleValue,
	operatorRateCents,
} from "./operator-labour";

const CALCULATED_KEY_PREFIX = "operator-labour:";

const WEEK_BOOKING_SELECT = {
	id: true,
	dealId: true,
	bookingKey: true,
	status: true,
	eventDate: true,
	requestedStartAt: true,
	requestedEndAt: true,
	confirmedStartAt: true,
	confirmedEndAt: true,
	operationalStartAt: true,
	operationalEndAt: true,
	resources: {
		select: { resourceType: true, quantity: true },
	},
	deal: {
		select: {
			id: true,
			name: true,
			stage: true,
			amount: true,
			currency: true,
			baseAmount: true,
			baseCurrency: true,
			paymentStatus: true,
			depositAmount: true,
			company: { select: { name: true } },
		},
	},
	emailThreads: {
		select: { id: true, subject: true, lastMessageAt: true },
		orderBy: { lastMessageAt: "desc" },
		take: FINANCE.maxEvidenceThreads,
	},
} as const satisfies Prisma.BookingSelect;

type WeekBooking = Prisma.BookingGetPayload<{
	select: typeof WEEK_BOOKING_SELECT;
}>;

type ExpenseRow = Prisma.ExpenseGetPayload<{
	select: {
		id: true;
		bookingId: true;
		dealId: true;
		category: true;
		source: true;
		status: true;
		amountCents: true;
		currency: true;
		incurredAt: true;
		note: true;
		receiptReference: true;
		evidence: true;
		ruleKey: true;
		ruleVersion: true;
		expectedAmountCents: true;
		discrepancyCents: true;
		operatorContact: {
			select: { id: true; firstName: true; lastName: true };
		};
		recurringTemplateKey: true;
	};
}>;

const EXPENSE_SELECT = {
	id: true,
	bookingId: true,
	dealId: true,
	category: true,
	source: true,
	status: true,
	amountCents: true,
	currency: true,
	incurredAt: true,
	note: true,
	receiptReference: true,
	evidence: true,
	ruleKey: true,
	ruleVersion: true,
	expectedAmountCents: true,
	discrepancyCents: true,
	operatorContact: { select: { id: true, firstName: true, lastName: true } },
	recurringTemplateKey: true,
} as const satisfies Prisma.ExpenseSelect;

const FINANCE_AUDIT_SELECT = {
	id: true,
	action: true,
	summary: true,
	createdAt: true,
} as const satisfies Prisma.FinanceAuditEventSelect;

const QUOTE_SELECT = {
	id: true,
	number: true,
	title: true,
	status: true,
	service: true,
	eventDate: true,
	currency: true,
	subtotalCents: true,
	discountCents: true,
	travelFeeCents: true,
	taxCents: true,
	totalCents: true,
	depositCents: true,
	balanceCents: true,
	taxEnabled: true,
	taxRateBasisPoints: true,
	notes: true,
	terms: true,
	documentKey: true,
	documentGeneratedAt: true,
	validUntil: true,
	sentAt: true,
	acceptedAt: true,
	declinedAt: true,
	voidedAt: true,
	deal: { select: { id: true, name: true } },
	booking: { select: { id: true, bookingKey: true } },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
	lineItems: {
		orderBy: { sortOrder: "asc" },
		select: {
			id: true,
			description: true,
			quantity: true,
			unitAmountCents: true,
			discountCents: true,
			totalCents: true,
			sortOrder: true,
		},
	},
	auditEvents: {
		orderBy: { createdAt: "desc" },
		take: 20,
		select: FINANCE_AUDIT_SELECT,
	},
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.QuoteSelect;

const INVOICE_SELECT = {
	id: true,
	number: true,
	title: true,
	status: true,
	service: true,
	eventDate: true,
	currency: true,
	subtotalCents: true,
	discountCents: true,
	travelFeeCents: true,
	taxCents: true,
	totalCents: true,
	depositRequiredCents: true,
	paidCents: true,
	balanceCents: true,
	taxEnabled: true,
	taxRateBasisPoints: true,
	notes: true,
	terms: true,
	paymentReference: true,
	documentKey: true,
	documentGeneratedAt: true,
	issueDate: true,
	dueDate: true,
	sentAt: true,
	paidAt: true,
	voidedAt: true,
	quote: { select: { id: true, number: true } },
	deal: { select: { id: true, name: true } },
	booking: { select: { id: true, bookingKey: true } },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
	lineItems: {
		orderBy: { sortOrder: "asc" },
		select: {
			id: true,
			description: true,
			quantity: true,
			unitAmountCents: true,
			discountCents: true,
			totalCents: true,
			sortOrder: true,
		},
	},
	auditEvents: {
		orderBy: { createdAt: "desc" },
		take: 20,
		select: FINANCE_AUDIT_SELECT,
	},
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.InvoiceSelect;

const PAYMENT_SELECT = {
	id: true,
	amountCents: true,
	currency: true,
	paidAt: true,
	method: true,
	reference: true,
	payerName: true,
	proofReference: true,
	notes: true,
	status: true,
	confirmedAt: true,
	failedAt: true,
	invoice: { select: { id: true, number: true } },
	deal: { select: { id: true, name: true } },
	booking: { select: { id: true, bookingKey: true } },
	company: { select: { id: true, name: true } },
	auditEvents: {
		orderBy: { createdAt: "desc" },
		take: 20,
		select: FINANCE_AUDIT_SELECT,
	},
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.PaymentRecordSelect;

const CONFIRMED_BOOKING_STATUSES = [
	BookingStatus.CONFIRMED,
	BookingStatus.COMPLETED,
] as const;

@Injectable()
export class FinanceService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly conversion: ConversionService,
	) {}

	async dashboard(
		source: BusinessContextSource,
	): Promise<FinanceDashboardOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();
		const scope = directBusinessUnitScope(context);
		const now = new Date();

		const [
			quotes,
			invoices,
			payments,
			expenses,
			staleQuotes,
			openInvoices,
			unmatchedPayments,
			reviewExpenses,
		] = await Promise.all([
			this.db.quote.aggregate({
				where: {
					AND: [
						scope,
						{ currency: base },
						{ status: { not: FinanceDocumentStatus.VOID } },
					],
				},
				_count: { _all: true },
				_sum: { totalCents: true },
			}),
			this.db.invoice.aggregate({
				where: {
					AND: [
						scope,
						{ currency: base },
						{ status: { not: InvoiceLifecycleStatus.VOID } },
					],
				},
				_count: { _all: true },
				_sum: { totalCents: true, paidCents: true, balanceCents: true },
			}),
			this.db.paymentRecord.aggregate({
				where: {
					AND: [
						scope,
						{ currency: base },
						{ status: { not: PaymentRecordStatus.CANCELLED } },
					],
				},
				_count: { _all: true },
				_sum: { amountCents: true },
			}),
			this.db.expense.aggregate({
				where: {
					AND: [
						scope,
						{ currency: base },
						{ status: { not: ExpenseStatus.CANCELLED } },
					],
				},
				_count: { _all: true },
				_sum: { amountCents: true },
			}),
			this.db.quote.findMany({
				where: {
					AND: [
						scope,
						{
							status: {
								in: [FinanceDocumentStatus.DRAFT, FinanceDocumentStatus.READY],
							},
						},
					],
				},
				orderBy: { updatedAt: "asc" },
				take: 5,
				select: { id: true, number: true, title: true, updatedAt: true },
			}),
			this.db.invoice.findMany({
				where: {
					AND: [
						scope,
						{ balanceCents: { gt: 0 } },
						{
							status: {
								notIn: [
									InvoiceLifecycleStatus.PAID,
									InvoiceLifecycleStatus.VOID,
								],
							},
						},
					],
				},
				orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
				take: 5,
				select: {
					id: true,
					number: true,
					title: true,
					dueDate: true,
					balanceCents: true,
					currency: true,
				},
			}),
			this.db.paymentRecord.findMany({
				where: { AND: [scope, { status: PaymentRecordStatus.UNMATCHED }] },
				orderBy: { paidAt: "desc" },
				take: 5,
				select: {
					id: true,
					amountCents: true,
					currency: true,
					paidAt: true,
					reference: true,
				},
			}),
			this.db.expense.findMany({
				where: { AND: [scope, { status: ExpenseStatus.NEEDS_REVIEW }] },
				orderBy: { incurredAt: "desc" },
				take: 5,
				select: {
					id: true,
					amountCents: true,
					currency: true,
					incurredAt: true,
					note: true,
				},
			}),
		]);

		return {
			reportingCurrency: base,
			generatedAt: now.toISOString(),
			quotes: {
				count: quotes._count._all,
				totalCents: quotes._sum.totalCents ?? 0,
			},
			invoices: {
				count: invoices._count._all,
				totalCents: invoices._sum.totalCents ?? 0,
				paidCents: invoices._sum.paidCents ?? 0,
				balanceCents: invoices._sum.balanceCents ?? 0,
			},
			payments: {
				count: payments._count._all,
				totalCents: payments._sum.amountCents ?? 0,
			},
			expenses: {
				count: expenses._count._all,
				totalCents: expenses._sum.amountCents ?? 0,
			},
			attention: [
				...staleQuotes.map((quote) => ({
					id: quote.id,
					kind: "quote" as const,
					title: `${quote.number} needs movement`,
					detail: quote.title,
					href: `/business-os/quotes/${quote.id}`,
				})),
				...openInvoices.map((invoice) => ({
					id: invoice.id,
					kind: "invoice" as const,
					title: `${invoice.number} has an open balance`,
					detail: `${invoice.currency} ${invoice.balanceCents / 100}`,
					href: `/business-os/invoices/${invoice.id}`,
				})),
				...unmatchedPayments.map((payment) => ({
					id: payment.id,
					kind: "payment" as const,
					title: "Payment needs matching",
					detail:
						payment.reference ?? payment.paidAt.toISOString().slice(0, 10),
					href: `/business-os/payments`,
				})),
				...reviewExpenses.map((expense) => ({
					id: expense.id,
					kind: "expense" as const,
					title: "Expense needs review",
					detail:
						expense.note ?? `${expense.currency} ${expense.amountCents / 100}`,
					href: `/business-os/expenses`,
				})),
			].slice(0, 12),
		};
	}

	async settings(
		source: BusinessContextSource,
	): Promise<FinanceSettingsOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const [settings, operatorRule] = await Promise.all([
			this.financeSettings(context.businessUnitId),
			this.operatorLabourRule(context.businessUnitId),
		]);
		return {
			businessUnitId: context.businessUnitId,
			version: settings.version,
			...settings.value,
			operatorRule,
		};
	}

	async updateSettings(
		source: BusinessContextSource & { userId: string },
		input: {
			defaultCurrency: string;
			taxEnabled: boolean;
			taxRateBasisPoints: number;
			depositBasisPoints: number;
			quoteValidityDays: number;
			invoiceDueDays: number;
			quotePrefix: string;
			invoicePrefix: string;
			operatorShortRateCents: number;
			operatorLongRateCents: number;
			operatorThresholdMinutes: number;
		},
	): Promise<FinanceSettingsOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const [settingsVersion, ruleVersion] = await Promise.all([
			this.nextFinanceRuleVersion(
				context.businessUnitId,
				FINANCE.settings.ruleKey,
			),
			this.nextFinanceRuleVersion(
				context.businessUnitId,
				FINANCE.operatorLabour.ruleKey,
			),
		]);

		await this.db.$transaction(async (tx) => {
			await tx.financeRule.updateMany({
				where: {
					businessUnitId: context.businessUnitId,
					key: {
						in: [FINANCE.settings.ruleKey, FINANCE.operatorLabour.ruleKey],
					},
					active: true,
				},
				data: { active: false },
			});
			await tx.financeRule.create({
				data: {
					businessUnitId: context.businessUnitId,
					key: FINANCE.settings.ruleKey,
					version: settingsVersion,
					active: true,
					value: {
						defaultCurrency: input.defaultCurrency,
						taxEnabled: input.taxEnabled,
						taxRateBasisPoints: input.taxRateBasisPoints,
						depositBasisPoints: input.depositBasisPoints,
						quoteValidityDays: input.quoteValidityDays,
						invoiceDueDays: input.invoiceDueDays,
						quotePrefix: input.quotePrefix,
						invoicePrefix: input.invoicePrefix,
					},
					createdById: source.userId,
				},
			});
			await tx.financeRule.create({
				data: {
					businessUnitId: context.businessUnitId,
					key: FINANCE.operatorLabour.ruleKey,
					version: ruleVersion,
					active: true,
					value: {
						currency: input.defaultCurrency,
						shortRateCents: input.operatorShortRateCents,
						longRateCents: input.operatorLongRateCents,
						longThresholdMinutes: input.operatorThresholdMinutes,
					},
					createdById: source.userId,
				},
			});
		});

		return this.settings(source);
	}

	async generateQuoteDocument(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<FinanceDocumentOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const quote = await this.db.quote.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: QUOTE_SELECT,
		});
		if (!quote) throw new NotFoundException(`No quote with id ${input.id}.`);
		const key = documentKey("quote", quote.id, quoteDocumentFingerprint(quote));
		const generatedAt =
			quote.documentKey === key && quote.documentGeneratedAt
				? quote.documentGeneratedAt
				: new Date();
		if (quote.documentKey !== key) {
			await this.db.quote.update({
				where: { id: quote.id },
				data: {
					documentKey: key,
					documentGeneratedAt: generatedAt,
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: FinanceAuditAction.UPDATED,
							summary: "Quote document generated.",
							actorUserId: source.userId,
							after: { documentKey: key },
						},
					},
				},
			});
		}
		return documentOutput(
			key,
			"quotes",
			quote.id,
			generatedAt,
			context.businessUnitId,
		);
	}

	async generateInvoiceDocument(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<FinanceDocumentOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const invoice = await this.db.invoice.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: INVOICE_SELECT,
		});
		if (!invoice)
			throw new NotFoundException(`No invoice with id ${input.id}.`);
		const key = documentKey(
			"invoice",
			invoice.id,
			invoiceDocumentFingerprint(invoice),
		);
		const generatedAt =
			invoice.documentKey === key && invoice.documentGeneratedAt
				? invoice.documentGeneratedAt
				: new Date();
		if (invoice.documentKey !== key) {
			await this.db.invoice.update({
				where: { id: invoice.id },
				data: {
					documentKey: key,
					documentGeneratedAt: generatedAt,
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: FinanceAuditAction.UPDATED,
							summary: "Invoice document generated.",
							actorUserId: source.userId,
							after: { documentKey: key },
						},
					},
				},
			});
		}
		return documentOutput(
			key,
			"invoices",
			invoice.id,
			generatedAt,
			context.businessUnitId,
		);
	}

	async documentPdf(
		source: BusinessContextSource,
		kind: "quotes" | "invoices",
		id: string,
	): Promise<{ filename: string; content: Buffer }> {
		const context = await resolveBusinessContext(this.db, source);
		if (kind === "quotes") {
			const quote = await this.db.quote.findFirst({
				where: { AND: [{ id }, directBusinessUnitScope(context)] },
				select: QUOTE_SELECT,
			});
			if (!quote) throw new NotFoundException(`No quote with id ${id}.`);
			return {
				filename: `${quote.number}.pdf`,
				content: renderFinanceDocumentPdf(quoteDocumentInput(quote)),
			};
		}
		const invoice = await this.db.invoice.findFirst({
			where: { AND: [{ id }, directBusinessUnitScope(context)] },
			select: INVOICE_SELECT,
		});
		if (!invoice) throw new NotFoundException(`No invoice with id ${id}.`);
		const entries = await this.db.ledgerEntry.findMany({
			where: { invoiceId: invoice.id },
			orderBy: { occurredAt: "asc" },
			take: 10,
			select: {
				id: true,
				source: true,
				sourceId: true,
				memo: true,
				currency: true,
				debitCents: true,
				creditCents: true,
				occurredAt: true,
				createdAt: true,
				account: { select: { id: true, name: true } },
			},
		});
		return {
			filename: `${invoice.number}.pdf`,
			content: renderFinanceDocumentPdf(
				invoiceDocumentInput(
					invoice,
					entries.map((entry) => ({
						id: entry.id,
						account: { id: entry.account.id, name: entry.account.name },
						source: entry.source,
						sourceId: entry.sourceId,
						memo: entry.memo,
						currency: entry.currency,
						debitCents: entry.debitCents,
						creditCents: entry.creditCents,
						occurredAt: entry.occurredAt.toISOString().slice(0, 10),
						createdAt: entry.createdAt.toISOString(),
					})),
				),
			),
		};
	}

	async quotes(
		source: BusinessContextSource,
		input: { search?: string; limit?: number },
	): Promise<QuoteListOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const search = input.search?.trim();
		const quotes = await this.db.quote.findMany({
			where: {
				AND: [
					directBusinessUnitScope(context),
					search
						? {
								OR: [
									{ number: { contains: search, mode: "insensitive" } },
									{ title: { contains: search, mode: "insensitive" } },
									{
										company: {
											name: { contains: search, mode: "insensitive" },
										},
									},
								],
							}
						: {},
				],
			},
			orderBy: { createdAt: "desc" },
			take: input.limit ?? 50,
			select: QUOTE_SELECT,
		});

		return { quotes: quotes.map(toQuoteOutput) };
	}

	async createQuote(
		source: BusinessContextSource & { userId: string },
		input: {
			businessUnitId?: string;
			dealId?: string;
			bookingId?: string;
			companyId?: string;
			contactId?: string;
			title: string;
			service?: string;
			eventDate?: string;
			currency: string;
			validUntil?: string;
			notes?: string;
			terms?: string;
			travelFeeCents?: number;
			discountCents?: number;
			depositCents?: number;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
				discountCents?: number;
			}[];
		},
	): Promise<QuoteMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const settings = await this.financeSettings(context.businessUnitId);
		const links = await this.resolveFinanceLinks(context, input);
		const totals = lineTotals(input.lineItems, {
			discountCents: input.discountCents,
			travelFeeCents: input.travelFeeCents,
			depositCents: input.depositCents,
			taxEnabled: settings.value.taxEnabled,
			taxRateBasisPoints: settings.value.taxRateBasisPoints,
		});
		const number = await this.nextDocumentNumber(settings.value.quotePrefix);
		const validUntil =
			input.validUntil ??
			new Date(Date.now() + settings.value.quoteValidityDays * DAY_MS)
				.toISOString()
				.slice(0, 10);

		const quote = await this.db.quote.create({
			data: {
				businessUnitId: context.businessUnitId,
				dealId: links.dealId,
				bookingId: links.bookingId,
				companyId: links.companyId,
				contactId: links.contactId,
				number,
				title: input.title,
				status: FinanceDocumentStatus.DRAFT,
				service: input.service ?? null,
				eventDate: input.eventDate ? dayDate(input.eventDate) : null,
				currency: input.currency,
				subtotalCents: totals.subtotalCents,
				discountCents: totals.discountCents,
				travelFeeCents: totals.travelFeeCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				depositCents: totals.depositCents,
				balanceCents: totals.balanceCents,
				taxEnabled: settings.value.taxEnabled,
				taxRateBasisPoints: settings.value.taxRateBasisPoints,
				validUntil: dayDate(validUntil),
				notes: input.notes ?? null,
				terms: input.terms ?? null,
				createdById: source.userId,
				lineItems: {
					create: input.lineItems.map((line, index) => ({
						description: line.description,
						quantity: line.quantity,
						unitAmountCents: line.unitAmountCents,
						discountCents: line.discountCents ?? 0,
						totalCents: Math.max(
							line.quantity * line.unitAmountCents - (line.discountCents ?? 0),
							0,
						),
						sortOrder: index,
					})),
				},
				auditEvents: {
					create: {
						businessUnitId: context.businessUnitId,
						action: FinanceAuditAction.CREATED,
						summary: "Quote created.",
						actorUserId: source.userId,
						after: {
							totalCents: totals.totalCents,
							depositCents: totals.depositCents,
							currency: input.currency,
						},
					},
				},
			},
			select: QUOTE_SELECT,
		});

		if (links.dealId) {
			await this.db.deal.update({
				where: { id: links.dealId },
				data: { quoteStatus: "READY" },
			});
		}

		return { quote: toQuoteOutput(quote) };
	}

	async updateQuote(
		source: BusinessContextSource & { userId: string },
		input: {
			id: string;
			businessUnitId?: string;
			dealId?: string;
			bookingId?: string;
			companyId?: string;
			contactId?: string;
			title: string;
			service?: string;
			eventDate?: string;
			currency: string;
			validUntil?: string;
			notes?: string;
			terms?: string;
			travelFeeCents?: number;
			discountCents?: number;
			depositCents?: number;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
				discountCents?: number;
			}[];
		},
	): Promise<QuoteMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.quote.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: {
				id: true,
				status: true,
				taxEnabled: true,
				taxRateBasisPoints: true,
				invoices: { take: 1, select: { id: true } },
			},
		});
		if (!existing) throw new NotFoundException(`No quote with id ${input.id}.`);
		if (
			existing.status === FinanceDocumentStatus.ACCEPTED ||
			existing.status === FinanceDocumentStatus.DECLINED ||
			existing.status === FinanceDocumentStatus.EXPIRED ||
			existing.status === FinanceDocumentStatus.ARCHIVED ||
			existing.status === FinanceDocumentStatus.VOID ||
			existing.invoices.length > 0
		) {
			throw new BadRequestException(
				"Only an unconverted active quote can edit.",
			);
		}

		const links = await this.resolveFinanceLinks(context, input);
		const totals = lineTotals(input.lineItems, {
			discountCents: input.discountCents,
			travelFeeCents: input.travelFeeCents,
			depositCents: input.depositCents,
			taxEnabled: existing.taxEnabled,
			taxRateBasisPoints: existing.taxRateBasisPoints,
		});
		const quote = await this.db.quote.update({
			where: { id: existing.id },
			data: {
				dealId: links.dealId,
				bookingId: links.bookingId,
				companyId: links.companyId,
				contactId: links.contactId,
				title: input.title,
				status:
					existing.status === FinanceDocumentStatus.SENT
						? FinanceDocumentStatus.READY
						: existing.status,
				service: input.service ?? null,
				eventDate: input.eventDate ? dayDate(input.eventDate) : null,
				currency: input.currency,
				subtotalCents: totals.subtotalCents,
				discountCents: totals.discountCents,
				travelFeeCents: totals.travelFeeCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				depositCents: totals.depositCents,
				balanceCents: totals.balanceCents,
				validUntil: input.validUntil ? dayDate(input.validUntil) : null,
				notes: input.notes ?? null,
				terms: input.terms ?? null,
				documentKey: null,
				documentGeneratedAt: null,
				lineItems: {
					deleteMany: {},
					create: input.lineItems.map((line, index) => ({
						description: line.description,
						quantity: line.quantity,
						unitAmountCents: line.unitAmountCents,
						discountCents: line.discountCents ?? 0,
						totalCents: Math.max(
							line.quantity * line.unitAmountCents - (line.discountCents ?? 0),
							0,
						),
						sortOrder: index,
					})),
				},
				auditEvents: {
					create: {
						businessUnitId: context.businessUnitId,
						action: FinanceAuditAction.UPDATED,
						summary: "Quote updated.",
						actorUserId: source.userId,
						before: { status: existing.status },
						after: {
							totalCents: totals.totalCents,
							depositCents: totals.depositCents,
							currency: input.currency,
						},
					},
				},
			},
			select: QUOTE_SELECT,
		});

		if (links.dealId) {
			await this.db.deal.update({
				where: { id: links.dealId },
				data: { quoteStatus: "READY" },
			});
		}

		return { quote: toQuoteOutput(quote) };
	}

	async duplicateQuote(
		source: BusinessContextSource & { userId: string },
		input: { id: string; businessUnitId?: string },
	): Promise<QuoteMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const quote = await this.db.quote.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: QUOTE_SELECT,
		});
		if (!quote) throw new NotFoundException(`No quote with id ${input.id}.`);

		return this.createQuote(source, {
			businessUnitId: context.businessUnitId ?? undefined,
			dealId: quote.deal?.id,
			bookingId: quote.booking?.id,
			companyId: quote.company?.id,
			contactId: quote.contact?.id,
			title: `${quote.title} copy`,
			service: quote.service ?? undefined,
			eventDate: quote.eventDate?.toISOString().slice(0, 10),
			currency: quote.currency,
			validUntil: quote.validUntil?.toISOString().slice(0, 10),
			notes: quote.notes ?? undefined,
			terms: quote.terms ?? undefined,
			travelFeeCents: quote.travelFeeCents,
			discountCents: quote.discountCents,
			depositCents: quote.depositCents,
			lineItems: quote.lineItems.map((line) => ({
				description: line.description,
				quantity: line.quantity,
				unitAmountCents: line.unitAmountCents,
				discountCents: line.discountCents,
			})),
		});
	}

	async updateQuoteStatus(
		source: BusinessContextSource & { userId: string },
		input: {
			id: string;
			status:
				| "READY"
				| "SENT"
				| "ACCEPTED"
				| "DECLINED"
				| "EXPIRED"
				| "ARCHIVED"
				| "VOID";
		},
	): Promise<QuoteMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.quote.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { id: true, dealId: true, status: true },
		});
		if (!existing) throw new NotFoundException(`No quote with id ${input.id}.`);

		const status = input.status as FinanceDocumentStatus;
		const quote = await this.db.quote.update({
			where: { id: existing.id },
			data: {
				status,
				sentAt: status === FinanceDocumentStatus.SENT ? new Date() : undefined,
				acceptedAt:
					status === FinanceDocumentStatus.ACCEPTED ? new Date() : undefined,
				declinedAt:
					status === FinanceDocumentStatus.DECLINED ? new Date() : undefined,
				voidedAt:
					status === FinanceDocumentStatus.VOID ||
					status === FinanceDocumentStatus.ARCHIVED
						? new Date()
						: undefined,
				auditEvents: {
					create: {
						businessUnitId: context.businessUnitId,
						action: quoteActionOf(status),
						summary: `Quote marked ${status.toLowerCase()}.`,
						actorUserId: source.userId,
						before: { status: existing.status },
						after: { status },
					},
				},
			},
			select: QUOTE_SELECT,
		});

		if (existing.dealId) {
			await this.db.deal.update({
				where: { id: existing.dealId },
				data: { quoteStatus: dealQuoteStatusOf(status) },
			});
		}

		return { quote: toQuoteOutput(quote) };
	}

	async convertQuoteToInvoice(
		source: BusinessContextSource & { userId: string },
		input: { id: string; issueDate?: string; dueDate?: string },
	): Promise<InvoiceMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const quote = await this.db.quote.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: {
				id: true,
				status: true,
				title: true,
				currency: true,
				invoices: {
					take: 1,
					orderBy: { createdAt: "asc" },
					select: INVOICE_SELECT,
				},
			},
		});
		if (!quote) throw new NotFoundException(`No quote with id ${input.id}.`);
		if (quote.invoices[0])
			return { invoice: toInvoiceOutput(quote.invoices[0]) };
		if (quote.status !== FinanceDocumentStatus.ACCEPTED) {
			throw new BadRequestException("Only an accepted quote can convert.");
		}

		const settings = await this.financeSettings(context.businessUnitId);
		const issueDate = input.issueDate ?? new Date().toISOString().slice(0, 10);
		const dueDate =
			input.dueDate ??
			new Date(
				dayDate(issueDate).getTime() + settings.value.invoiceDueDays * DAY_MS,
			)
				.toISOString()
				.slice(0, 10);
		const invoice = await this.createInvoice(source, {
			quoteId: quote.id,
			title: quote.title,
			currency: quote.currency,
			issueDate,
			dueDate,
			lineItems: [
				{ description: quote.title, quantity: 1, unitAmountCents: 0 },
			],
		});
		await this.db.financeAuditEvent.create({
			data: {
				businessUnitId: context.businessUnitId,
				quoteId: quote.id,
				invoiceId: invoice.invoice.id,
				action: FinanceAuditAction.CONVERTED,
				summary: "Quote converted to invoice.",
				actorUserId: source.userId,
				after: { invoiceId: invoice.invoice.id },
			},
		});
		return invoice;
	}

	async invoices(
		source: BusinessContextSource,
		input: { search?: string; limit?: number },
	): Promise<InvoiceListOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const search = input.search?.trim();
		const invoices = await this.db.invoice.findMany({
			where: {
				AND: [
					directBusinessUnitScope(context),
					search
						? {
								OR: [
									{ number: { contains: search, mode: "insensitive" } },
									{ title: { contains: search, mode: "insensitive" } },
									{
										company: {
											name: { contains: search, mode: "insensitive" },
										},
									},
								],
							}
						: {},
				],
			},
			orderBy: { createdAt: "desc" },
			take: input.limit ?? 50,
			select: INVOICE_SELECT,
		});

		return { invoices: invoices.map(toInvoiceOutput) };
	}

	async createInvoice(
		source: BusinessContextSource & { userId: string },
		input: {
			businessUnitId?: string;
			quoteId?: string;
			dealId?: string;
			bookingId?: string;
			companyId?: string;
			contactId?: string;
			title: string;
			service?: string;
			eventDate?: string;
			currency: string;
			issueDate: string;
			dueDate?: string;
			notes?: string;
			terms?: string;
			travelFeeCents?: number;
			discountCents?: number;
			depositRequiredCents?: number;
			paymentReference?: string;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
				discountCents?: number;
			}[];
		},
	): Promise<InvoiceMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const settings = await this.financeSettings(context.businessUnitId);
		const quote = input.quoteId
			? await this.db.quote.findFirst({
					where: {
						AND: [{ id: input.quoteId }, directBusinessUnitScope(context)],
					},
					select: {
						id: true,
						dealId: true,
						bookingId: true,
						companyId: true,
						contactId: true,
						title: true,
						service: true,
						eventDate: true,
						currency: true,
						notes: true,
						terms: true,
						discountCents: true,
						travelFeeCents: true,
						depositCents: true,
						taxEnabled: true,
						taxRateBasisPoints: true,
						lineItems: {
							orderBy: { sortOrder: "asc" },
							select: {
								description: true,
								quantity: true,
								unitAmountCents: true,
								discountCents: true,
							},
						},
					},
				})
			: null;
		if (input.quoteId && !quote) {
			throw new NotFoundException(`No quote with id ${input.quoteId}.`);
		}

		const links = await this.resolveFinanceLinks(context, {
			dealId: input.dealId ?? quote?.dealId ?? undefined,
			bookingId: input.bookingId ?? quote?.bookingId ?? undefined,
			companyId: input.companyId ?? quote?.companyId ?? undefined,
			contactId: input.contactId ?? quote?.contactId ?? undefined,
		});
		const lines = input.quoteId && quote ? quote.lineItems : input.lineItems;
		const totals = lineTotals(lines, {
			discountCents:
				input.quoteId && quote ? quote.discountCents : input.discountCents,
			travelFeeCents:
				input.quoteId && quote ? quote.travelFeeCents : input.travelFeeCents,
			depositCents:
				input.quoteId && quote
					? quote.depositCents
					: input.depositRequiredCents,
			taxEnabled:
				input.quoteId && quote ? quote.taxEnabled : settings.value.taxEnabled,
			taxRateBasisPoints:
				input.quoteId && quote
					? quote.taxRateBasisPoints
					: settings.value.taxRateBasisPoints,
		});
		const number = await this.nextDocumentNumber(settings.value.invoicePrefix);
		const dueDate =
			input.dueDate ??
			new Date(
				dayDate(input.issueDate).getTime() +
					settings.value.invoiceDueDays * DAY_MS,
			)
				.toISOString()
				.slice(0, 10);

		const invoice = await this.db.$transaction(async (tx) => {
			const created = await tx.invoice.create({
				data: {
					businessUnitId: context.businessUnitId,
					quoteId: quote?.id ?? null,
					dealId: links.dealId,
					bookingId: links.bookingId,
					companyId: links.companyId,
					contactId: links.contactId,
					number,
					title: input.quoteId && quote ? quote.title : input.title,
					status: InvoiceLifecycleStatus.DRAFT,
					service:
						input.quoteId && quote ? quote.service : (input.service ?? null),
					eventDate:
						input.quoteId && quote
							? quote.eventDate
							: input.eventDate
								? dayDate(input.eventDate)
								: null,
					currency: input.quoteId && quote ? quote.currency : input.currency,
					subtotalCents: totals.subtotalCents,
					discountCents: totals.discountCents,
					travelFeeCents: totals.travelFeeCents,
					taxCents: totals.taxCents,
					totalCents: totals.totalCents,
					depositRequiredCents: totals.depositCents,
					paidCents: 0,
					balanceCents: totals.totalCents,
					taxEnabled:
						input.quoteId && quote
							? quote.taxEnabled
							: settings.value.taxEnabled,
					taxRateBasisPoints:
						input.quoteId && quote
							? quote.taxRateBasisPoints
							: settings.value.taxRateBasisPoints,
					issueDate: dayDate(input.issueDate),
					dueDate: dayDate(dueDate),
					notes: input.quoteId && quote ? quote.notes : (input.notes ?? null),
					terms: input.quoteId && quote ? quote.terms : (input.terms ?? null),
					paymentReference: input.paymentReference ?? null,
					createdById: source.userId,
					lineItems: {
						create: lines.map((line, index) => ({
							description: line.description,
							quantity: line.quantity,
							unitAmountCents: line.unitAmountCents,
							discountCents: line.discountCents ?? 0,
							totalCents: Math.max(
								line.quantity * line.unitAmountCents -
									(line.discountCents ?? 0),
								0,
							),
							sortOrder: index,
						})),
					},
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: FinanceAuditAction.CREATED,
							summary: "Invoice created.",
							actorUserId: source.userId,
							after: {
								totalCents: totals.totalCents,
								depositRequiredCents: totals.depositCents,
								currency:
									input.quoteId && quote ? quote.currency : input.currency,
							},
						},
					},
				},
				select: INVOICE_SELECT,
			});
			await this.ensureInvoiceLedger(tx, context.businessUnitId, created);
			return created;
		});

		if (links.dealId) {
			await this.db.deal.update({
				where: { id: links.dealId },
				data: { invoiceStatus: "REQUESTED" },
			});
		}

		return { invoice: toInvoiceOutput(invoice) };
	}

	async updateInvoice(
		source: BusinessContextSource & { userId: string },
		input: {
			id: string;
			businessUnitId?: string;
			dealId?: string;
			bookingId?: string;
			companyId?: string;
			contactId?: string;
			title: string;
			service?: string;
			eventDate?: string;
			currency: string;
			issueDate: string;
			dueDate?: string;
			notes?: string;
			terms?: string;
			travelFeeCents?: number;
			discountCents?: number;
			depositRequiredCents?: number;
			paymentReference?: string;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
				discountCents?: number;
			}[];
		},
	): Promise<InvoiceMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.invoice.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: {
				id: true,
				status: true,
				quoteId: true,
				paidCents: true,
				taxEnabled: true,
				taxRateBasisPoints: true,
			},
		});
		if (!existing)
			throw new NotFoundException(`No invoice with id ${input.id}.`);
		if (existing.status !== InvoiceLifecycleStatus.DRAFT) {
			throw new BadRequestException("Only a draft invoice can edit.");
		}
		if (existing.paidCents > 0) {
			throw new BadRequestException("A paid invoice cannot edit.");
		}

		const links = await this.resolveFinanceLinks(context, input);
		const totals = lineTotals(input.lineItems, {
			discountCents: input.discountCents,
			travelFeeCents: input.travelFeeCents,
			depositCents: input.depositRequiredCents,
			taxEnabled: existing.taxEnabled,
			taxRateBasisPoints: existing.taxRateBasisPoints,
		});
		const invoice = await this.db.$transaction(async (tx) => {
			const updated = await tx.invoice.update({
				where: { id: existing.id },
				data: {
					dealId: links.dealId,
					bookingId: links.bookingId,
					companyId: links.companyId,
					contactId: links.contactId,
					title: input.title,
					service: input.service ?? null,
					eventDate: input.eventDate ? dayDate(input.eventDate) : null,
					currency: input.currency,
					subtotalCents: totals.subtotalCents,
					discountCents: totals.discountCents,
					travelFeeCents: totals.travelFeeCents,
					taxCents: totals.taxCents,
					totalCents: totals.totalCents,
					depositRequiredCents: totals.depositCents,
					balanceCents: totals.totalCents,
					issueDate: dayDate(input.issueDate),
					dueDate: input.dueDate ? dayDate(input.dueDate) : null,
					notes: input.notes ?? null,
					terms: input.terms ?? null,
					paymentReference: input.paymentReference ?? null,
					documentKey: null,
					documentGeneratedAt: null,
					lineItems: {
						deleteMany: {},
						create: input.lineItems.map((line, index) => ({
							description: line.description,
							quantity: line.quantity,
							unitAmountCents: line.unitAmountCents,
							discountCents: line.discountCents ?? 0,
							totalCents: Math.max(
								line.quantity * line.unitAmountCents -
									(line.discountCents ?? 0),
								0,
							),
							sortOrder: index,
						})),
					},
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: FinanceAuditAction.UPDATED,
							summary: "Invoice updated.",
							actorUserId: source.userId,
							after: {
								totalCents: totals.totalCents,
								depositRequiredCents: totals.depositCents,
								currency: input.currency,
							},
						},
					},
				},
				select: INVOICE_SELECT,
			});
			await this.ensureInvoiceLedger(tx, context.businessUnitId, updated);
			return updated;
		});

		if (links.dealId) {
			await this.db.deal.update({
				where: { id: links.dealId },
				data: { invoiceStatus: "REQUESTED" },
			});
		}

		return { invoice: toInvoiceOutput(invoice) };
	}

	async updateInvoiceStatus(
		source: BusinessContextSource & { userId: string },
		input: { id: string; status: "SENT" | "OVERDUE" | "CANCELLED" | "VOID" },
	): Promise<InvoiceMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.invoice.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { id: true, dealId: true, status: true },
		});
		if (!existing)
			throw new NotFoundException(`No invoice with id ${input.id}.`);

		const status = input.status as InvoiceLifecycleStatus;
		const invoice = await this.db.invoice.update({
			where: { id: existing.id },
			data: {
				status,
				sentAt: status === InvoiceLifecycleStatus.SENT ? new Date() : undefined,
				voidedAt:
					status === InvoiceLifecycleStatus.VOID ||
					status === InvoiceLifecycleStatus.CANCELLED
						? new Date()
						: undefined,
				auditEvents: {
					create: {
						businessUnitId: context.businessUnitId,
						action:
							status === InvoiceLifecycleStatus.VOID
								? FinanceAuditAction.VOIDED
								: status === InvoiceLifecycleStatus.CANCELLED
									? FinanceAuditAction.VOIDED
									: FinanceAuditAction.SENT,
						summary: `Invoice marked ${status.toLowerCase()}.`,
						actorUserId: source.userId,
						before: { status: existing.status },
						after: { status },
					},
				},
			},
			select: INVOICE_SELECT,
		});

		if (existing.dealId && status === InvoiceLifecycleStatus.SENT) {
			await this.db.deal.update({
				where: { id: existing.dealId },
				data: { invoiceStatus: "SENT" },
			});
		}

		return { invoice: toInvoiceOutput(invoice) };
	}

	async payments(
		source: BusinessContextSource,
		input: { search?: string; limit?: number },
	): Promise<PaymentListOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const search = input.search?.trim();
		const payments = await this.db.paymentRecord.findMany({
			where: {
				AND: [
					directBusinessUnitScope(context),
					search
						? {
								OR: [
									{ reference: { contains: search, mode: "insensitive" } },
									{ payerName: { contains: search, mode: "insensitive" } },
									{
										company: {
											name: { contains: search, mode: "insensitive" },
										},
									},
								],
							}
						: {},
				],
			},
			orderBy: { paidAt: "desc" },
			take: input.limit ?? 50,
			select: PAYMENT_SELECT,
		});

		return { payments: payments.map(toPaymentOutput) };
	}

	async createPayment(
		source: BusinessContextSource & { userId: string },
		input: {
			businessUnitId?: string;
			invoiceId?: string;
			dealId?: string;
			bookingId?: string;
			companyId?: string;
			amountCents: number;
			currency: string;
			paidAt: string;
			method: Prisma.PaymentRecordCreateInput["method"];
			reference?: string;
			payerName?: string;
			proofReference?: string;
			notes?: string;
		},
	): Promise<PaymentMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const invoice = input.invoiceId
			? await this.db.invoice.findFirst({
					where: {
						AND: [{ id: input.invoiceId }, directBusinessUnitScope(context)],
					},
					select: {
						id: true,
						dealId: true,
						bookingId: true,
						companyId: true,
						currency: true,
					},
				})
			: null;
		if (input.invoiceId && !invoice) {
			throw new NotFoundException(`No invoice with id ${input.invoiceId}.`);
		}
		const links = await this.resolveFinanceLinks(context, {
			dealId: input.dealId ?? invoice?.dealId ?? undefined,
			bookingId: input.bookingId ?? invoice?.bookingId ?? undefined,
			companyId: input.companyId ?? invoice?.companyId ?? undefined,
		});

		const payment = await this.db.$transaction(async (tx) => {
			const created = await tx.paymentRecord.create({
				data: {
					businessUnitId: context.businessUnitId,
					invoiceId: invoice?.id ?? null,
					dealId: links.dealId,
					bookingId: links.bookingId,
					companyId: links.companyId,
					amountCents: input.amountCents,
					currency: input.currency,
					paidAt: dayDate(input.paidAt),
					method: input.method,
					reference: input.reference ?? null,
					payerName: input.payerName ?? null,
					proofReference: input.proofReference ?? null,
					notes: input.notes ?? null,
					status: invoice
						? PaymentRecordStatus.MATCHED
						: PaymentRecordStatus.UNMATCHED,
					createdById: source.userId,
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: FinanceAuditAction.CREATED,
							summary: "Payment created.",
							actorUserId: source.userId,
							after: {
								amountCents: input.amountCents,
								currency: input.currency,
							},
						},
					},
				},
				select: PAYMENT_SELECT,
			});
			if (invoice) {
				await this.applyPaymentToInvoice(
					tx,
					context.businessUnitId,
					invoice.id,
					source.userId,
				);
				await this.ensurePaymentLedger(tx, context.businessUnitId, created);
			}
			return tx.paymentRecord.findUniqueOrThrow({
				where: { id: created.id },
				select: PAYMENT_SELECT,
			});
		});

		return { payment: toPaymentOutput(payment) };
	}

	async matchPayment(
		source: BusinessContextSource & { userId: string },
		input: { id: string; invoiceId: string | null },
	): Promise<PaymentMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const payment = await this.db.paymentRecord.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { id: true, invoiceId: true },
		});
		if (!payment)
			throw new NotFoundException(`No payment with id ${input.id}.`);

		if (input.invoiceId) {
			const invoice = await this.db.invoice.findFirst({
				where: {
					AND: [{ id: input.invoiceId }, directBusinessUnitScope(context)],
				},
				select: { id: true },
			});
			if (!invoice) {
				throw new NotFoundException(`No invoice with id ${input.invoiceId}.`);
			}
		}

		const updated = await this.db.$transaction(async (tx) => {
			const row = await tx.paymentRecord.update({
				where: { id: payment.id },
				data: {
					invoiceId: input.invoiceId,
					status: input.invoiceId
						? PaymentRecordStatus.MATCHED
						: PaymentRecordStatus.UNMATCHED,
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action: input.invoiceId
								? FinanceAuditAction.MATCHED
								: FinanceAuditAction.UNMATCHED,
							summary: input.invoiceId
								? "Payment matched."
								: "Payment unmatched.",
							actorUserId: source.userId,
							before: { invoiceId: payment.invoiceId },
							after: { invoiceId: input.invoiceId },
						},
					},
				},
				select: PAYMENT_SELECT,
			});
			if (payment.invoiceId) {
				await this.applyPaymentToInvoice(
					tx,
					context.businessUnitId,
					payment.invoiceId,
					source.userId,
				);
			}
			if (input.invoiceId) {
				await this.applyPaymentToInvoice(
					tx,
					context.businessUnitId,
					input.invoiceId,
					source.userId,
				);
				await this.ensurePaymentLedger(tx, context.businessUnitId, row);
			}
			return tx.paymentRecord.findUniqueOrThrow({
				where: { id: row.id },
				select: PAYMENT_SELECT,
			});
		});

		return { payment: toPaymentOutput(updated) };
	}

	async updatePaymentStatus(
		source: BusinessContextSource & { userId: string },
		input: {
			id: string;
			status:
				| "PENDING"
				| "CONFIRMED"
				| "FAILED"
				| "REFUNDED"
				| "PARTIALLY_REFUNDED"
				| "CANCELLED";
		},
	): Promise<PaymentMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.paymentRecord.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { id: true, invoiceId: true, status: true },
		});
		if (!existing)
			throw new NotFoundException(`No payment with id ${input.id}.`);

		const status = input.status as PaymentRecordStatus;
		const payment = await this.db.$transaction(async (tx) => {
			const updated = await tx.paymentRecord.update({
				where: { id: existing.id },
				data: {
					status,
					confirmedAt:
						status === PaymentRecordStatus.CONFIRMED ? new Date() : null,
					failedAt: status === PaymentRecordStatus.FAILED ? new Date() : null,
					auditEvents: {
						create: {
							businessUnitId: context.businessUnitId,
							action:
								status === PaymentRecordStatus.CONFIRMED
									? FinanceAuditAction.CONFIRMED
									: status === PaymentRecordStatus.CANCELLED
										? FinanceAuditAction.VOIDED
										: FinanceAuditAction.UPDATED,
							summary: `Payment marked ${status.toLowerCase()}.`,
							actorUserId: source.userId,
							before: { status: existing.status },
							after: { status },
						},
					},
				},
				select: PAYMENT_SELECT,
			});
			if (existing.invoiceId) {
				await this.applyPaymentToInvoice(
					tx,
					context.businessUnitId,
					existing.invoiceId,
					source.userId,
				);
			}
			if (
				updated.invoice &&
				(updated.status === PaymentRecordStatus.MATCHED ||
					updated.status === PaymentRecordStatus.CONFIRMED)
			) {
				await this.ensurePaymentLedger(tx, context.businessUnitId, updated);
			} else {
				await tx.ledgerEntry.deleteMany({
					where: {
						source: FinanceLedgerEntrySource.PAYMENT,
						sourceId: updated.id,
					},
				});
			}
			return tx.paymentRecord.findUniqueOrThrow({
				where: { id: updated.id },
				select: PAYMENT_SELECT,
			});
		});

		return { payment: toPaymentOutput(payment) };
	}

	async accounting(source: BusinessContextSource): Promise<AccountingOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();
		await this.ensureLedgerAccounts(this.db, context.businessUnitId);

		const accounts = await this.db.ledgerAccount.findMany({
			where: directBusinessUnitScope(context),
			orderBy: { code: "asc" },
			select: {
				id: true,
				code: true,
				name: true,
				type: true,
				entries: {
					select: { debitCents: true, creditCents: true, currency: true },
				},
			},
		});
		const entries = await this.db.ledgerEntry.findMany({
			where: directBusinessUnitScope(context),
			orderBy: { occurredAt: "desc" },
			take: 100,
			select: {
				id: true,
				source: true,
				sourceId: true,
				memo: true,
				currency: true,
				debitCents: true,
				creditCents: true,
				occurredAt: true,
				createdAt: true,
				account: { select: { id: true, name: true } },
			},
		});

		return {
			accounts: accounts.map((account) => ({
				id: account.id,
				code: account.code,
				name: account.name,
				type: account.type,
				currency: base,
				balanceCents: account.entries
					.filter((entry) => entry.currency === base)
					.reduce(
						(total, entry) => total + entry.debitCents - entry.creditCents,
						0,
					),
			})),
			entries: entries.map((entry) => ({
				id: entry.id,
				account: { id: entry.account.id, name: entry.account.name },
				source: entry.source,
				sourceId: entry.sourceId,
				memo: entry.memo,
				currency: entry.currency,
				debitCents: entry.debitCents,
				creditCents: entry.creditCents,
				occurredAt: entry.occurredAt.toISOString().slice(0, 10),
				createdAt: entry.createdAt.toISOString(),
			})),
		};
	}

	async week(
		source: BusinessContextSource,
		input: { businessUnitId?: string; weekStart?: string },
	): Promise<FinanceWeekOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();
		const start = mondayOf(input.weekStart);
		const end = new Date(start.getTime() + FINANCE.weekDays * DAY_MS);

		const bookings = await this.db.booking.findMany({
			where: {
				AND: [
					bookingScope(context),
					{ eventDate: { gte: start, lt: end } },
					{ status: { not: BookingStatus.CANCELLED } },
				],
			},
			orderBy: [{ eventDate: "asc" }, { bookingKey: "asc" }],
			select: WEEK_BOOKING_SELECT,
		});

		await this.reconcileLabour(context, bookings);
		const labourRule = await this.operatorLabourRule(context.businessUnitId);

		const expenses = await this.db.expense.findMany({
			where: {
				AND: [
					directBusinessUnitScope(context),
					{ status: { not: ExpenseStatus.CANCELLED } },
					{ incurredAt: { gte: start, lt: end } },
				],
			},
			orderBy: [{ incurredAt: "asc" }, { createdAt: "asc" }],
			select: EXPENSE_SELECT,
		});

		const expensesByBooking = new Map<string, ExpenseRow[]>();
		for (const expense of expenses) {
			if (!expense.bookingId) continue;
			const group = expensesByBooking.get(expense.bookingId);
			if (group) group.push(expense);
			else expensesByBooking.set(expense.bookingId, [expense]);
		}

		const rows = bookings.map((booking) =>
			this.weekRow(
				booking,
				base,
				expensesByBooking.get(booking.id) ?? [],
				labourRule,
			),
		);

		const labourIncluded = base === labourRule.currency.toUpperCase();
		const labourCents = labourIncluded
			? expenses
					.filter(
						(expense) =>
							expense.category === ExpenseCategory.OPERATOR_LABOUR &&
							expense.currency.toUpperCase() === base,
					)
					.reduce((total, expense) => total + expense.amountCents, 0)
			: 0;
		const otherExpensesCents = expenses
			.filter(
				(expense) =>
					expense.category !== ExpenseCategory.OPERATOR_LABOUR &&
					expense.currency.toUpperCase() === base,
			)
			.reduce((total, expense) => total + expense.amountCents, 0);
		const unconvertedExpenseCount = expenses.filter(
			(expense) => expense.currency.toUpperCase() !== base,
		).length;

		const expectedRevenueCents = rows.reduce(
			(total, row) => total + (row.revenueCents ?? 0),
			0,
		);
		const confirmedRevenueCents = rows
			.filter((row) =>
				(CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]).includes(
					row.status,
				),
			)
			.reduce((total, row) => total + (row.revenueCents ?? 0), 0);
		const paymentsReceivedCents = rows.reduce(
			(total, row) => total + (row.paymentsReceivedCents ?? 0),
			0,
		);
		const unconvertedDealCount = rows.filter((row) =>
			row.issues.includes("REVENUE_UNCONVERTED"),
		).length;

		const projectedGrossProfitCents =
			labourIncluded &&
			unconvertedDealCount === 0 &&
			unconvertedExpenseCount === 0
				? expectedRevenueCents - labourCents - otherExpensesCents
				: null;

		return {
			reportingCurrency: base,
			generatedAt: new Date().toISOString(),
			week: { start: start.toISOString(), end: end.toISOString() },
			totals: {
				events: rows.length,
				confirmedEvents: rows.filter((row) =>
					(CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]).includes(
						row.status,
					),
				).length,
				expectedRevenueCents,
				confirmedRevenueCents,
				priceNeededCount: rows.filter((row) => row.priceNeeded).length,
				paymentsReceivedCents,
				outstandingCents: Math.max(
					expectedRevenueCents - paymentsReceivedCents,
					0,
				),
				operatorLabourCents: labourCents,
				operatorLabourCurrency: labourRule.currency,
				labourExcludedFromTotals: !labourIncluded,
				otherExpensesCents,
				projectedGrossProfitCents,
				unconvertedDealCount,
				unconvertedExpenseCount,
			},
			rows,
			expenses: expenses.map(toExpenseEntry),
		};
	}

	async addExpense(
		source: BusinessContextSource & { userId: string },
		input: {
			businessUnitId?: string;
			bookingId?: string;
			dealId?: string;
			operatorContactId?: string;
			category: ExpenseCategory;
			amountCents: number;
			currency?: string;
			incurredAt: string;
			note?: string;
			receiptReference?: string;
			recurringTemplateKey?: string;
		},
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);
		const base = await this.conversion.reportingCurrency();

		if (input.bookingId) {
			const booking = await this.db.booking.findFirst({
				where: { AND: [{ id: input.bookingId }, bookingScope(context)] },
				select: { id: true, dealId: true },
			});
			if (!booking) {
				throw new NotFoundException(`No booking with id ${input.bookingId}.`);
			}
			if (input.dealId && input.dealId !== booking.dealId) {
				throw new BadRequestException(
					"That booking belongs to a different deal.",
				);
			}
			input = { ...input, dealId: booking.dealId };
		} else if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { id: true },
			});
			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}
		}

		if (input.operatorContactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: input.operatorContactId },
				select: { id: true },
			});
			if (!contact) {
				throw new NotFoundException(
					`No contact with id ${input.operatorContactId}.`,
				);
			}
		}

		const expense = await this.db.expense.create({
			data: {
				businessUnitId: context.businessUnitId,
				bookingId: input.bookingId ?? null,
				dealId: input.dealId ?? null,
				operatorContactId: input.operatorContactId ?? null,
				category: input.category,
				source: ExpenseSource.MANUAL,
				status: ExpenseStatus.RECORDED,
				amountCents: input.amountCents,
				currency: input.currency ?? base,
				incurredAt: dayDate(input.incurredAt),
				note: input.note ?? null,
				receiptReference: input.receiptReference ?? null,
				recurringTemplateKey: input.recurringTemplateKey ?? null,
				createdById: source.userId,
			},
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(expense) };
	}

	async createRecurringExpense(
		source: BusinessContextSource & { userId: string },
		input: {
			templateKey: string;
			category: ExpenseCategory;
			amountCents: number;
			currency?: string;
			incurredAt: string;
			note?: string;
		},
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);
		const calculationKey = `recurring:${context.businessUnitId}:${input.templateKey}:${input.incurredAt}`;
		const existing = await this.db.expense.findUnique({
			where: { calculationKey },
			select: EXPENSE_SELECT,
		});
		if (existing) return { expense: toExpenseEntry(existing) };

		const created = await this.addExpense(source, {
			businessUnitId: context.businessUnitId,
			category: input.category,
			amountCents: input.amountCents,
			currency: input.currency,
			incurredAt: input.incurredAt,
			note: input.note,
			recurringTemplateKey: input.templateKey,
		});
		const expense = await this.db.expense.update({
			where: { id: created.expense.id },
			data: { calculationKey },
			select: EXPENSE_SELECT,
		});
		return { expense: toExpenseEntry(expense) };
	}

	async cancelExpense(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);

		const expense = await this.db.expense.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { ...EXPENSE_SELECT },
		});

		if (!expense) {
			throw new NotFoundException(`No expense with id ${input.id}.`);
		}
		if (expense.source === ExpenseSource.CALCULATED) {
			throw new BadRequestException(
				"Calculated operator labour follows the booking; change the booking instead.",
			);
		}

		const updated = await this.db.expense.update({
			where: { id: expense.id },
			data: { status: ExpenseStatus.CANCELLED },
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(updated) };
	}

	async markExpensePaid(
		source: BusinessContextSource & { userId: string },
		input: { id: string },
	): Promise<{ expense: ExpenseEntryOutput }> {
		const context = await resolveBusinessContext(this.db, source);

		const expense = await this.db.expense.findFirst({
			where: { AND: [{ id: input.id }, directBusinessUnitScope(context)] },
			select: { ...EXPENSE_SELECT },
		});

		if (!expense) {
			throw new NotFoundException(`No expense with id ${input.id}.`);
		}
		if (expense.status === ExpenseStatus.CANCELLED) {
			throw new BadRequestException("A cancelled expense cannot be paid.");
		}

		const updated = await this.db.expense.update({
			where: { id: expense.id },
			data: { status: ExpenseStatus.PAID },
			select: EXPENSE_SELECT,
		});

		return { expense: toExpenseEntry(updated) };
	}

	private async resolveFinanceLinks(
		context: BusinessContext,
		input: {
			dealId?: string | null;
			bookingId?: string | null;
			companyId?: string | null;
			contactId?: string | null;
		},
	): Promise<{
		dealId: string | null;
		bookingId: string | null;
		companyId: string | null;
		contactId: string | null;
	}> {
		let dealId = input.dealId ?? null;
		const bookingId = input.bookingId ?? null;
		let companyId = input.companyId ?? null;
		const contactId = input.contactId ?? null;

		if (bookingId) {
			const booking = await this.db.booking.findFirst({
				where: { AND: [{ id: bookingId }, bookingScope(context)] },
				select: {
					id: true,
					dealId: true,
					deal: { select: { companyId: true } },
				},
			});
			if (!booking)
				throw new NotFoundException(`No booking with id ${bookingId}.`);
			dealId = booking.dealId;
			companyId = booking.deal.companyId;
		}

		if (dealId) {
			const deal = await this.db.deal.findFirst({
				where: {
					AND: [{ id: dealId }, { bookings: { some: bookingScope(context) } }],
				},
				select: { id: true, companyId: true },
			});
			if (!deal) throw new NotFoundException(`No deal with id ${dealId}.`);
			companyId = companyId ?? deal.companyId;
		}

		if (companyId) {
			const company = await this.db.company.findUnique({
				where: { id: companyId },
				select: { id: true },
			});
			if (!company)
				throw new NotFoundException(`No company with id ${companyId}.`);
		}

		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { id: true },
			});
			if (!contact)
				throw new NotFoundException(`No contact with id ${contactId}.`);
		}

		return { dealId, bookingId, companyId, contactId };
	}

	private async operatorLabourRule(
		businessUnitId: string | null,
	): Promise<OperatorLabourRule> {
		const row = await this.db.financeRule.findFirst({
			where: {
				key: FINANCE.operatorLabour.ruleKey,
				active: true,
				OR: [{ businessUnitId }, { businessUnitId: null }],
			},
			orderBy: [{ businessUnitId: "desc" }, { version: "desc" }],
			select: { key: true, version: true, value: true },
		});
		if (!row) return DEFAULT_OPERATOR_LABOUR_RULE;
		const parsed = operatorLabourRuleValue.safeParse(row.value);
		if (!parsed.success) return DEFAULT_OPERATOR_LABOUR_RULE;
		return { key: row.key, version: row.version, ...parsed.data };
	}

	private async financeSettings(
		businessUnitId: string | null,
	): Promise<{ version: number; value: FinanceSettingsValue }> {
		const row = await this.db.financeRule.findFirst({
			where: {
				key: FINANCE.settings.ruleKey,
				active: true,
				OR: [{ businessUnitId }, { businessUnitId: null }],
			},
			orderBy: [{ businessUnitId: "desc" }, { version: "desc" }],
			select: { version: true, value: true },
		});
		if (!row) return { version: 1, value: DEFAULT_FINANCE_SETTINGS };
		const parsed = financeSettingsValue.safeParse(row.value);
		if (!parsed.success) {
			return { version: row.version, value: DEFAULT_FINANCE_SETTINGS };
		}
		return { version: row.version, value: parsed.data };
	}

	private async nextFinanceRuleVersion(
		businessUnitId: string | null,
		key: string,
	): Promise<number> {
		const row = await this.db.financeRule.aggregate({
			where: { businessUnitId, key },
			_max: { version: true },
		});
		return (row._max.version ?? 0) + 1;
	}

	private async nextDocumentNumber(prefix: string): Promise<string> {
		const count =
			prefix === FINANCE.documents.quotePrefix
				? await this.db.quote.count()
				: await this.db.invoice.count();
		return `${prefix}-${String(count + 1).padStart(FINANCE.documents.numberPad, "0")}`;
	}

	private async ensureLedgerAccounts(
		tx: Db | Prisma.TransactionClient,
		businessUnitId: string | null,
	): Promise<Record<keyof typeof FINANCE.ledgerAccounts, string>> {
		const entries = await Promise.all(
			Object.entries(FINANCE.ledgerAccounts).map(async ([key, account]) => {
				const data = {
					name: account.name,
					type: account.type as FinanceLedgerAccountType,
					active: true,
					system: true,
				};
				const row = businessUnitId
					? await tx.ledgerAccount.upsert({
							where: {
								businessUnitId_code: {
									businessUnitId,
									code: account.code,
								},
							},
							create: { businessUnitId, code: account.code, ...data },
							update: data,
							select: { id: true },
						})
					: await tx.ledgerAccount
							.findFirst({
								where: { businessUnitId: null, code: account.code },
								select: { id: true },
							})
							.then((existing) =>
								existing
									? tx.ledgerAccount.update({
											where: { id: existing.id },
											data,
											select: { id: true },
										})
									: tx.ledgerAccount.create({
											data: {
												businessUnitId: null,
												code: account.code,
												...data,
											},
											select: { id: true },
										}),
							);
				return [key, row.id] as const;
			}),
		);

		return Object.fromEntries(entries) as Record<
			keyof typeof FINANCE.ledgerAccounts,
			string
		>;
	}

	private async ensureInvoiceLedger(
		tx: Prisma.TransactionClient,
		businessUnitId: string | null,
		invoice: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>,
	): Promise<void> {
		const accounts = await this.ensureLedgerAccounts(tx, businessUnitId);
		await tx.ledgerEntry.deleteMany({
			where: {
				source: FinanceLedgerEntrySource.INVOICE,
				sourceId: invoice.id,
			},
		});
		await tx.ledgerEntry.createMany({
			data: [
				{
					businessUnitId,
					accountId: accounts.receivables,
					invoiceId: invoice.id,
					source: FinanceLedgerEntrySource.INVOICE,
					sourceId: invoice.id,
					memo: invoice.number,
					currency: invoice.currency,
					debitCents: invoice.totalCents,
					occurredAt: invoice.issueDate,
				},
				{
					businessUnitId,
					accountId: accounts.revenue,
					invoiceId: invoice.id,
					source: FinanceLedgerEntrySource.INVOICE,
					sourceId: invoice.id,
					memo: invoice.number,
					currency: invoice.currency,
					creditCents: invoice.totalCents,
					occurredAt: invoice.issueDate,
				},
			],
		});
	}

	private async ensurePaymentLedger(
		tx: Prisma.TransactionClient,
		businessUnitId: string | null,
		payment: Prisma.PaymentRecordGetPayload<{ select: typeof PAYMENT_SELECT }>,
	): Promise<void> {
		if (!payment.invoice) return;
		const accounts = await this.ensureLedgerAccounts(tx, businessUnitId);
		await tx.ledgerEntry.deleteMany({
			where: {
				source: FinanceLedgerEntrySource.PAYMENT,
				sourceId: payment.id,
			},
		});
		await tx.ledgerEntry.createMany({
			data: [
				{
					businessUnitId,
					accountId: accounts.cash,
					paymentId: payment.id,
					source: FinanceLedgerEntrySource.PAYMENT,
					sourceId: payment.id,
					memo: payment.reference ?? payment.invoice.number,
					currency: payment.currency,
					debitCents: payment.amountCents,
					occurredAt: payment.paidAt,
				},
				{
					businessUnitId,
					accountId: accounts.receivables,
					paymentId: payment.id,
					source: FinanceLedgerEntrySource.PAYMENT,
					sourceId: payment.id,
					memo: payment.reference ?? payment.invoice.number,
					currency: payment.currency,
					creditCents: payment.amountCents,
					occurredAt: payment.paidAt,
				},
			],
		});
	}

	private async applyPaymentToInvoice(
		tx: Prisma.TransactionClient,
		businessUnitId: string | null,
		invoiceId: string,
		userId: string,
	): Promise<void> {
		const invoice = await tx.invoice.findUniqueOrThrow({
			where: { id: invoiceId },
			select: {
				id: true,
				dealId: true,
				totalCents: true,
				status: true,
				sentAt: true,
				currency: true,
				payments: {
					where: {
						status: {
							in: [PaymentRecordStatus.MATCHED, PaymentRecordStatus.CONFIRMED],
						},
					},
					select: { amountCents: true, currency: true },
				},
			},
		});
		const paidCents = invoice.payments
			.filter((payment) => payment.currency === invoice.currency)
			.reduce((total, payment) => total + payment.amountCents, 0);
		const balanceCents = Math.max(invoice.totalCents - paidCents, 0);
		let status = invoice.status;
		if (
			invoice.status !== InvoiceLifecycleStatus.VOID &&
			invoice.status !== InvoiceLifecycleStatus.CANCELLED
		) {
			status =
				balanceCents === 0
					? InvoiceLifecycleStatus.PAID
					: paidCents > 0
						? InvoiceLifecycleStatus.PARTIALLY_PAID
						: invoice.sentAt
							? InvoiceLifecycleStatus.SENT
							: InvoiceLifecycleStatus.DRAFT;
		}

		await tx.invoice.update({
			where: { id: invoice.id },
			data: {
				paidCents,
				balanceCents,
				status,
				paidAt: status === InvoiceLifecycleStatus.PAID ? new Date() : null,
				auditEvents: {
					create: {
						businessUnitId,
						action: FinanceAuditAction.PAID,
						summary: "Invoice payment state recalculated.",
						actorUserId: userId,
						after: { paidCents, balanceCents, status },
					},
				},
			},
		});

		if (invoice.dealId) {
			await tx.deal.update({
				where: { id: invoice.dealId },
				data: {
					paymentStatus:
						status === InvoiceLifecycleStatus.PAID
							? PaymentStatus.FULLY_PAID
							: paidCents > 0
								? PaymentStatus.DEPOSIT_PAID
								: PaymentStatus.UNPAID,
				},
			});
		}
	}

	private async reconcileLabour(
		context: BusinessContext,
		bookings: WeekBooking[],
	): Promise<void> {
		const bookingIds = bookings.map((booking) => booking.id);
		if (bookingIds.length === 0) return;

		const existing = await this.db.expense.findMany({
			where: {
				source: ExpenseSource.CALCULATED,
				bookingId: { in: bookingIds },
			},
			select: {
				id: true,
				bookingId: true,
				dealId: true,
				status: true,
				amountCents: true,
				currency: true,
				incurredAt: true,
				evidence: true,
				ruleKey: true,
				ruleVersion: true,
				expectedAmountCents: true,
				discrepancyCents: true,
			},
		});
		const byBooking = new Map(
			existing.map((expense) => [expense.bookingId, expense]),
		);
		const rule = await this.operatorLabourRule(context.businessUnitId);

		for (const booking of bookings) {
			const durationMinutes = bookingDurationMinutes(booking);
			const operatorCount = operatorCountOf(booking.resources);
			const costCents = operatorLabourCostCents(
				durationMinutes,
				operatorCount,
				rule,
			);
			const current = byBooking.get(booking.id);
			const derivedStatus =
				current?.status === ExpenseStatus.PAID ||
				current?.status === ExpenseStatus.CONFIRMED
					? current.status
					: labourStatusOf(booking);

			if (
				costCents === null ||
				durationMinutes === null ||
				operatorCount === null
			) {
				if (current) {
					await this.db.expense.delete({ where: { id: current.id } });
				}
				continue;
			}

			const evidence: ExpenseEvidence = {
				kind: "operator-labour-calc",
				durationMinutes,
				operatorCount,
				rateCents: operatorRateCents(durationMinutes, rule),
				ruleKey: rule.key,
				ruleVersion: rule.version,
			};

			if (
				current &&
				(current.status === ExpenseStatus.PAID ||
					current.status === ExpenseStatus.CONFIRMED) &&
				current.amountCents !== costCents
			) {
				await this.db.expense.update({
					where: { id: current.id },
					data: {
						dealId: booking.dealId,
						incurredAt: booking.eventDate,
						evidence,
						ruleKey: rule.key,
						ruleVersion: rule.version,
						expectedAmountCents: costCents,
						discrepancyCents: costCents - current.amountCents,
					},
				});
				continue;
			}

			const unchanged =
				current &&
				current.amountCents === costCents &&
				current.dealId === booking.dealId &&
				current.status === derivedStatus &&
				current.incurredAt.getTime() === booking.eventDate.getTime() &&
				parseExpenseEvidence(current.evidence)?.durationMinutes ===
					durationMinutes &&
				parseExpenseEvidence(current.evidence)?.operatorCount ===
					operatorCount &&
				current.ruleKey === rule.key &&
				current.ruleVersion === rule.version &&
				current.expectedAmountCents === costCents &&
				(current.discrepancyCents ?? 0) === 0;

			if (unchanged) continue;

			await this.db.expense.upsert({
				where: {
					calculationKey: `${CALCULATED_KEY_PREFIX}${booking.id}`,
				},
				create: {
					businessUnitId: context.businessUnitId,
					bookingId: booking.id,
					dealId: booking.dealId,
					category: ExpenseCategory.OPERATOR_LABOUR,
					source: ExpenseSource.CALCULATED,
					status: derivedStatus,
					amountCents: costCents,
					currency: rule.currency,
					incurredAt: booking.eventDate,
					note: "Auto-calculated operator labour",
					evidence,
					ruleKey: rule.key,
					ruleVersion: rule.version,
					expectedAmountCents: costCents,
					discrepancyCents: 0,
					calculationKey: `${CALCULATED_KEY_PREFIX}${booking.id}`,
				},
				update: {
					dealId: booking.dealId,
					amountCents: costCents,
					incurredAt: booking.eventDate,
					evidence,
					ruleKey: rule.key,
					ruleVersion: rule.version,
					expectedAmountCents: costCents,
					discrepancyCents: 0,
					status: derivedStatus,
				},
			});
		}
	}

	private weekRow(
		booking: WeekBooking,
		base: string,
		expenses: ExpenseRow[],
		labourRule: OperatorLabourRule,
	): FinanceWeekRowOutput {
		const deal = booking.deal;
		const durationMinutes = bookingDurationMinutes(booking);
		const operatorCount = operatorCountOf(booking.resources);
		const operatorCost = operatorLabourCostCents(
			durationMinutes,
			operatorCount,
			labourRule,
		);

		const amountCents = toCents(deal.amount);
		const converted =
			deal.baseCurrency === base && deal.baseAmount !== null
				? toCents(deal.baseAmount)
				: null;
		const priceNeeded = amountCents === null;
		const revenueUnconverted = !priceNeeded && converted === null;
		const revenueCents = priceNeeded ? null : converted;

		const paymentsReceivedCents = paymentReceivedCents(deal, base);
		const otherExpensesCents = expenses
			.filter(
				(expense) =>
					expense.category !== ExpenseCategory.OPERATOR_LABOUR &&
					expense.currency.toUpperCase() === base,
			)
			.reduce((total, expense) => total + expense.amountCents, 0);

		const issues: FinanceWeekRowOutput["issues"] = [];
		if (priceNeeded) issues.push("PRICE_NEEDED");
		if (operatorCount === null) issues.push("OPERATOR_COUNT_NEEDED");
		if (durationMinutes === null) issues.push("DURATION_NEEDED");
		if (revenueUnconverted) issues.push("REVENUE_UNCONVERTED");

		const projectedMarginCents =
			revenueCents !== null && operatorCost !== null
				? revenueCents - operatorCost - otherExpensesCents
				: null;

		return {
			bookingId: booking.id,
			bookingKey: booking.bookingKey,
			dealId: deal.id,
			event: deal.name,
			company: deal.company.name,
			status: booking.status,
			eventDate: booking.eventDate.toISOString().slice(0, 10),
			startsAt:
				(
					booking.confirmedStartAt ??
					booking.operationalStartAt ??
					booking.requestedStartAt
				)?.toISOString() ?? null,
			endsAt:
				(
					booking.confirmedEndAt ??
					booking.operationalEndAt ??
					booking.requestedEndAt
				)?.toISOString() ?? null,
			durationMinutes,
			revenueCents,
			priceNeeded,
			paymentStatus: deal.paymentStatus,
			paymentsReceivedCents,
			operatorCount,
			operatorRateCents:
				durationMinutes === null
					? null
					: operatorRateCents(durationMinutes, labourRule),
			operatorCostCents: operatorCost,
			estimatedLabourWithOneOperatorCents:
				operatorCost === null &&
				durationMinutes !== null &&
				operatorCount === null
					? operatorRateCents(durationMinutes, labourRule)
					: null,
			otherExpensesCents,
			projectedMarginCents,
			issues,
			evidence: booking.emailThreads.map((thread) => ({
				kind: "email-thread" as const,
				id: thread.id,
				label: thread.subject ?? "Email thread",
				occurredAt: thread.lastMessageAt?.toISOString() ?? null,
			})),
		};
	}
}

function paymentReceivedCents(
	deal: WeekBooking["deal"],
	base: string,
): number | null {
	if (deal.paymentStatus === PaymentStatus.FULLY_PAID) {
		if (deal.baseCurrency === base && deal.baseAmount !== null) {
			return toCents(deal.baseAmount);
		}
		return deal.currency.toUpperCase() === base ? toCents(deal.amount) : null;
	}

	if (deal.paymentStatus === PaymentStatus.DEPOSIT_PAID) {
		return deal.currency.toUpperCase() === base
			? toCents(deal.depositAmount)
			: null;
	}

	return null;
}

function toExpenseEntry(expense: ExpenseRow): ExpenseEntryOutput {
	return {
		id: expense.id,
		bookingId: expense.bookingId,
		dealId: expense.dealId,
		category: expense.category,
		source: expense.source,
		status: expense.status,
		amountCents: expense.amountCents,
		currency: expense.currency,
		incurredAt: expense.incurredAt.toISOString().slice(0, 10),
		note: expense.note,
		receiptReference: expense.receiptReference,
		evidence: parseExpenseEvidence(expense.evidence),
		ruleKey: expense.ruleKey,
		ruleVersion: expense.ruleVersion,
		expectedAmountCents: expense.expectedAmountCents,
		discrepancyCents: expense.discrepancyCents,
		operatorContact: expense.operatorContact
			? {
					id: expense.operatorContact.id,
					name: contactName(expense.operatorContact),
				}
			: null,
		recurringTemplateKey: expense.recurringTemplateKey,
	};
}

function toQuoteOutput(
	quote: Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>,
): QuoteMutationOutput["quote"] {
	return {
		id: quote.id,
		number: quote.number,
		title: quote.title,
		status: quote.status,
		service: quote.service,
		eventDate: quote.eventDate?.toISOString().slice(0, 10) ?? null,
		currency: quote.currency,
		subtotalCents: quote.subtotalCents,
		discountCents: quote.discountCents,
		travelFeeCents: quote.travelFeeCents,
		taxCents: quote.taxCents,
		totalCents: quote.totalCents,
		depositCents: quote.depositCents,
		balanceCents: quote.balanceCents,
		taxEnabled: quote.taxEnabled,
		taxRateBasisPoints: quote.taxRateBasisPoints,
		notes: quote.notes,
		terms: quote.terms,
		documentKey: quote.documentKey,
		documentGeneratedAt: quote.documentGeneratedAt?.toISOString() ?? null,
		validUntil: quote.validUntil?.toISOString().slice(0, 10) ?? null,
		sentAt: quote.sentAt?.toISOString() ?? null,
		acceptedAt: quote.acceptedAt?.toISOString() ?? null,
		declinedAt: quote.declinedAt?.toISOString() ?? null,
		voidedAt: quote.voidedAt?.toISOString() ?? null,
		deal: quote.deal,
		booking: quote.booking
			? { id: quote.booking.id, name: quote.booking.bookingKey }
			: null,
		company: quote.company,
		contact: quote.contact
			? { id: quote.contact.id, name: contactName(quote.contact) }
			: null,
		lineItems: quote.lineItems,
		auditEvents: quote.auditEvents.map(toAuditOutput),
		createdAt: quote.createdAt.toISOString(),
		updatedAt: quote.updatedAt.toISOString(),
	};
}

function toInvoiceOutput(
	invoice: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>,
): InvoiceMutationOutput["invoice"] {
	return {
		id: invoice.id,
		number: invoice.number,
		title: invoice.title,
		status: invoice.status,
		service: invoice.service,
		eventDate: invoice.eventDate?.toISOString().slice(0, 10) ?? null,
		currency: invoice.currency,
		subtotalCents: invoice.subtotalCents,
		discountCents: invoice.discountCents,
		travelFeeCents: invoice.travelFeeCents,
		taxCents: invoice.taxCents,
		totalCents: invoice.totalCents,
		depositRequiredCents: invoice.depositRequiredCents,
		paidCents: invoice.paidCents,
		balanceCents: invoice.balanceCents,
		taxEnabled: invoice.taxEnabled,
		taxRateBasisPoints: invoice.taxRateBasisPoints,
		notes: invoice.notes,
		terms: invoice.terms,
		paymentReference: invoice.paymentReference,
		documentKey: invoice.documentKey,
		documentGeneratedAt: invoice.documentGeneratedAt?.toISOString() ?? null,
		issueDate: invoice.issueDate.toISOString().slice(0, 10),
		dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
		sentAt: invoice.sentAt?.toISOString() ?? null,
		paidAt: invoice.paidAt?.toISOString() ?? null,
		voidedAt: invoice.voidedAt?.toISOString() ?? null,
		quote: invoice.quote
			? { id: invoice.quote.id, name: invoice.quote.number }
			: null,
		deal: invoice.deal,
		booking: invoice.booking
			? { id: invoice.booking.id, name: invoice.booking.bookingKey }
			: null,
		company: invoice.company,
		contact: invoice.contact
			? { id: invoice.contact.id, name: contactName(invoice.contact) }
			: null,
		lineItems: invoice.lineItems,
		auditEvents: invoice.auditEvents.map(toAuditOutput),
		createdAt: invoice.createdAt.toISOString(),
		updatedAt: invoice.updatedAt.toISOString(),
	};
}

function toPaymentOutput(
	payment: Prisma.PaymentRecordGetPayload<{ select: typeof PAYMENT_SELECT }>,
): PaymentMutationOutput["payment"] {
	return {
		id: payment.id,
		amountCents: payment.amountCents,
		currency: payment.currency,
		paidAt: payment.paidAt.toISOString().slice(0, 10),
		method: payment.method,
		reference: payment.reference,
		payerName: payment.payerName,
		proofReference: payment.proofReference,
		notes: payment.notes,
		status: payment.status,
		confirmedAt: payment.confirmedAt?.toISOString() ?? null,
		failedAt: payment.failedAt?.toISOString() ?? null,
		invoice: payment.invoice
			? { id: payment.invoice.id, name: payment.invoice.number }
			: null,
		deal: payment.deal,
		booking: payment.booking
			? { id: payment.booking.id, name: payment.booking.bookingKey }
			: null,
		company: payment.company,
		auditEvents: payment.auditEvents.map(toAuditOutput),
		createdAt: payment.createdAt.toISOString(),
		updatedAt: payment.updatedAt.toISOString(),
	};
}

function documentKey(
	kind: "quote" | "invoice",
	id: string,
	value:
		| ReturnType<typeof quoteDocumentFingerprint>
		| ReturnType<typeof invoiceDocumentFingerprint>,
) {
	const hash = createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")
		.slice(0, 16);
	return `finance/${kind}/${id}/${hash}.pdf`;
}

function documentOutput(
	key: string,
	kind: "quotes" | "invoices",
	id: string,
	generatedAt: Date,
	businessUnitId: string,
): FinanceDocumentOutput {
	return {
		documentKey: key,
		documentUrl: `/api/finance/documents/${kind}/${id}.pdf?businessUnitId=${encodeURIComponent(businessUnitId)}`,
		generatedAt: generatedAt.toISOString(),
	};
}

function quoteDocumentInput(
	quote: Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>,
): FinanceDocumentPdfInput {
	return {
		type: "Quote",
		number: quote.number,
		title: quote.title,
		customer: customerName(quote.company, quote.contact),
		event:
			quote.booking?.bookingKey ??
			quote.eventDate?.toISOString().slice(0, 10) ??
			"Unassigned",
		service: quote.service ?? "Event service",
		currency: quote.currency,
		lines: quote.lineItems.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unitAmount: money(line.unitAmountCents, quote.currency),
			discount: money(line.discountCents, quote.currency),
			total: money(line.totalCents, quote.currency),
		})),
		totals: quoteTotals(quote),
		terms: quote.terms,
		meta: [
			{
				label: "Valid until",
				value: quote.validUntil?.toISOString().slice(0, 10) ?? "Not set",
			},
			{ label: "Status", value: quote.status },
			{ label: "Deposit", value: money(quote.depositCents, quote.currency) },
			{ label: "Balance", value: money(quote.balanceCents, quote.currency) },
		],
		audit: [],
	};
}

function quoteDocumentFingerprint(
	quote: Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>,
) {
	return {
		number: quote.number,
		title: quote.title,
		status: quote.status,
		service: quote.service,
		eventDate: quote.eventDate?.toISOString().slice(0, 10) ?? null,
		currency: quote.currency,
		subtotalCents: quote.subtotalCents,
		discountCents: quote.discountCents,
		travelFeeCents: quote.travelFeeCents,
		taxCents: quote.taxCents,
		totalCents: quote.totalCents,
		depositCents: quote.depositCents,
		balanceCents: quote.balanceCents,
		taxEnabled: quote.taxEnabled,
		taxRateBasisPoints: quote.taxRateBasisPoints,
		terms: quote.terms,
		validUntil: quote.validUntil?.toISOString().slice(0, 10) ?? null,
		company: quote.company?.name ?? null,
		contact: quote.contact ? contactName(quote.contact) : null,
		booking: quote.booking?.bookingKey ?? null,
		lines: quote.lineItems.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unitAmountCents: line.unitAmountCents,
			discountCents: line.discountCents,
			totalCents: line.totalCents,
			sortOrder: line.sortOrder,
		})),
	};
}

function invoiceDocumentInput(
	invoice: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>,
	audit: AccountingOutput["entries"],
): FinanceDocumentPdfInput {
	return {
		type: "Invoice",
		number: invoice.number,
		title: invoice.title,
		customer: customerName(invoice.company, invoice.contact),
		event:
			invoice.booking?.bookingKey ??
			invoice.eventDate?.toISOString().slice(0, 10) ??
			"Unassigned",
		service: invoice.service ?? "Event service",
		currency: invoice.currency,
		lines: invoice.lineItems.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unitAmount: money(line.unitAmountCents, invoice.currency),
			discount: money(line.discountCents, invoice.currency),
			total: money(line.totalCents, invoice.currency),
		})),
		totals: invoiceTotals(invoice),
		terms: invoice.terms,
		meta: [
			{
				label: "Issue date",
				value: invoice.issueDate.toISOString().slice(0, 10),
			},
			{
				label: "Due date",
				value: invoice.dueDate?.toISOString().slice(0, 10) ?? "Not set",
			},
			{
				label: "Payment reference",
				value: invoice.paymentReference ?? invoice.number,
			},
			{ label: "Status", value: invoice.status },
		],
		audit,
	};
}

function invoiceDocumentFingerprint(
	invoice: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>,
) {
	return {
		number: invoice.number,
		title: invoice.title,
		status: invoice.status,
		service: invoice.service,
		eventDate: invoice.eventDate?.toISOString().slice(0, 10) ?? null,
		currency: invoice.currency,
		subtotalCents: invoice.subtotalCents,
		discountCents: invoice.discountCents,
		travelFeeCents: invoice.travelFeeCents,
		taxCents: invoice.taxCents,
		totalCents: invoice.totalCents,
		depositRequiredCents: invoice.depositRequiredCents,
		paidCents: invoice.paidCents,
		balanceCents: invoice.balanceCents,
		taxEnabled: invoice.taxEnabled,
		taxRateBasisPoints: invoice.taxRateBasisPoints,
		terms: invoice.terms,
		paymentReference: invoice.paymentReference,
		issueDate: invoice.issueDate.toISOString().slice(0, 10),
		dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
		company: invoice.company?.name ?? null,
		contact: invoice.contact ? contactName(invoice.contact) : null,
		booking: invoice.booking?.bookingKey ?? null,
		lines: invoice.lineItems.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unitAmountCents: line.unitAmountCents,
			discountCents: line.discountCents,
			totalCents: line.totalCents,
			sortOrder: line.sortOrder,
		})),
	};
}

function quoteTotals(
	quote: Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>,
): FinanceDocumentLine[] {
	const totals = [
		{ label: "Subtotal", value: money(quote.subtotalCents, quote.currency) },
		{ label: "Discount", value: money(quote.discountCents, quote.currency) },
		{ label: "Travel", value: money(quote.travelFeeCents, quote.currency) },
	];
	if (quote.taxEnabled) {
		totals.push({ label: "Tax", value: money(quote.taxCents, quote.currency) });
	}
	totals.push({
		label: "Total",
		value: money(quote.totalCents, quote.currency),
	});
	return totals;
}

function invoiceTotals(
	invoice: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>,
): FinanceDocumentLine[] {
	const totals = [
		{
			label: "Subtotal",
			value: money(invoice.subtotalCents, invoice.currency),
		},
		{
			label: "Discount",
			value: money(invoice.discountCents, invoice.currency),
		},
		{ label: "Travel", value: money(invoice.travelFeeCents, invoice.currency) },
	];
	if (invoice.taxEnabled) {
		totals.push({
			label: "Tax",
			value: money(invoice.taxCents, invoice.currency),
		});
	}
	totals.push(
		{ label: "Total", value: money(invoice.totalCents, invoice.currency) },
		{ label: "Paid", value: money(invoice.paidCents, invoice.currency) },
		{
			label: "Outstanding",
			value: money(invoice.balanceCents, invoice.currency),
		},
	);
	return totals;
}

function customerName(
	company: { name: string } | null,
	contact: { firstName: string; lastName: string | null } | null,
) {
	return company?.name ?? (contact ? contactName(contact) : "Unassigned");
}

function toAuditOutput(
	audit: Prisma.FinanceAuditEventGetPayload<{
		select: typeof FINANCE_AUDIT_SELECT;
	}>,
) {
	return {
		id: audit.id,
		action: audit.action,
		summary: audit.summary,
		createdAt: audit.createdAt.toISOString(),
	};
}

function contactName(contact: { firstName: string; lastName: string | null }) {
	return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

type LineTotalInput = {
	quantity: number;
	unitAmountCents: number;
	discountCents?: number;
};

type LineTotals = {
	subtotalCents: number;
	discountCents: number;
	travelFeeCents: number;
	taxCents: number;
	totalCents: number;
	depositCents: number;
	balanceCents: number;
};

function lineTotals(
	lines: LineTotalInput[],
	input: {
		discountCents?: number;
		travelFeeCents?: number;
		depositCents?: number;
		taxEnabled?: boolean;
		taxRateBasisPoints?: number;
	} = {},
): LineTotals {
	const lineSubtotalCents = lines.reduce(
		(total, line) =>
			total +
			Math.max(
				line.quantity * line.unitAmountCents - (line.discountCents ?? 0),
				0,
			),
		0,
	);
	const discountCents = input.discountCents ?? 0;
	const travelFeeCents = input.travelFeeCents ?? 0;
	const subtotalCents = Math.max(
		lineSubtotalCents + travelFeeCents - discountCents,
		0,
	);
	const taxCents = input.taxEnabled
		? Math.round((subtotalCents * (input.taxRateBasisPoints ?? 0)) / 10_000)
		: 0;
	const totalCents = subtotalCents + taxCents;
	const depositCents = Math.min(input.depositCents ?? 0, totalCents);
	return {
		subtotalCents,
		discountCents,
		travelFeeCents,
		taxCents,
		totalCents,
		depositCents,
		balanceCents: totalCents - depositCents,
	};
}

function quoteActionOf(status: FinanceDocumentStatus): FinanceAuditAction {
	if (status === FinanceDocumentStatus.SENT) return FinanceAuditAction.SENT;
	if (status === FinanceDocumentStatus.ACCEPTED) {
		return FinanceAuditAction.ACCEPTED;
	}
	if (status === FinanceDocumentStatus.DECLINED) {
		return FinanceAuditAction.DECLINED;
	}
	if (status === FinanceDocumentStatus.EXPIRED) {
		return FinanceAuditAction.EXPIRED;
	}
	if (status === FinanceDocumentStatus.ARCHIVED) {
		return FinanceAuditAction.ARCHIVED;
	}
	if (status === FinanceDocumentStatus.VOID) return FinanceAuditAction.VOIDED;
	return FinanceAuditAction.UPDATED;
}

function dealQuoteStatusOf(status: FinanceDocumentStatus) {
	if (
		status === FinanceDocumentStatus.DECLINED ||
		status === FinanceDocumentStatus.EXPIRED ||
		status === FinanceDocumentStatus.ARCHIVED ||
		status === FinanceDocumentStatus.VOID
	) {
		return "REJECTED" as const;
	}
	if (status === FinanceDocumentStatus.DRAFT) return "NOT_READY" as const;
	return "READY" as const;
}

function labourStatusOf(booking: WeekBooking): ExpenseStatus {
	const todayStart = new Date(
		Date.UTC(
			new Date().getUTCFullYear(),
			new Date().getUTCMonth(),
			new Date().getUTCDate(),
		),
	);
	const eventPassed = booking.eventDate.getTime() < todayStart.getTime();
	const settled = (
		CONFIRMED_BOOKING_STATUSES as readonly BookingStatus[]
	).includes(booking.status);
	return eventPassed && settled
		? ExpenseStatus.CONFIRMED
		: ExpenseStatus.PROJECTED;
}

function dayDate(value: string): Date {
	const date = new Date(`${value}T00:00:00.000Z`);
	if (
		Number.isNaN(date.getTime()) ||
		date.toISOString().slice(0, 10) !== value
	) {
		throw new BadRequestException("incurredAt must be a real calendar date.");
	}
	return date;
}

function mondayOf(weekStart?: string): Date {
	const today = weekStart
		? dayDate(weekStart)
		: new Date(
				Date.UTC(
					new Date().getUTCFullYear(),
					new Date().getUTCMonth(),
					new Date().getUTCDate(),
				),
			);
	const mondayOffset = (today.getUTCDay() + 6) % 7;
	return new Date(today.getTime() - mondayOffset * DAY_MS);
}
