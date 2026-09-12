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
	bookingDurationMinutes,
	operatorCountOf,
	operatorLabourCostCents,
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
		evidence: true;
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
	evidence: true,
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
	currency: true,
	subtotalCents: true,
	taxCents: true,
	totalCents: true,
	taxEnabled: true,
	taxRateBasisPoints: true,
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
	currency: true,
	subtotalCents: true,
	taxCents: true,
	totalCents: true,
	paidCents: true,
	balanceCents: true,
	taxEnabled: true,
	taxRateBasisPoints: true,
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
	status: true,
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
			currency: string;
			validUntil?: string;
			notes?: string;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
			}[];
		},
	): Promise<QuoteMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
		const links = await this.resolveFinanceLinks(context, input);
		const totals = lineTotals(input.lineItems);
		const number = await this.nextDocumentNumber(FINANCE.documents.quotePrefix);

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
				currency: input.currency,
				subtotalCents: totals.subtotalCents,
				taxCents: 0,
				totalCents: totals.subtotalCents,
				taxEnabled: false,
				taxRateBasisPoints: 0,
				validUntil: input.validUntil ? dayDate(input.validUntil) : null,
				notes: input.notes ?? null,
				createdById: source.userId,
				lineItems: {
					create: input.lineItems.map((line, index) => ({
						description: line.description,
						quantity: line.quantity,
						unitAmountCents: line.unitAmountCents,
						totalCents: line.quantity * line.unitAmountCents,
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
							totalCents: totals.subtotalCents,
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

	async updateQuoteStatus(
		source: BusinessContextSource & { userId: string },
		input: {
			id: string;
			status: "READY" | "SENT" | "ACCEPTED" | "DECLINED" | "VOID";
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
					status === FinanceDocumentStatus.VOID ? new Date() : undefined,
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
			currency: string;
			issueDate: string;
			dueDate?: string;
			notes?: string;
			lineItems: {
				description: string;
				quantity: number;
				unitAmountCents: number;
			}[];
		},
	): Promise<InvoiceMutationOutput> {
		const context = await resolveBusinessContext(this.db, source);
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
		const totals = lineTotals(input.lineItems);
		const number = await this.nextDocumentNumber(
			FINANCE.documents.invoicePrefix,
		);

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
					title: input.title,
					status: InvoiceLifecycleStatus.DRAFT,
					currency: input.currency,
					subtotalCents: totals.subtotalCents,
					taxCents: 0,
					totalCents: totals.subtotalCents,
					paidCents: 0,
					balanceCents: totals.subtotalCents,
					taxEnabled: false,
					taxRateBasisPoints: 0,
					issueDate: dayDate(input.issueDate),
					dueDate: input.dueDate ? dayDate(input.dueDate) : null,
					notes: input.notes ?? null,
					createdById: source.userId,
					lineItems: {
						create: input.lineItems.map((line, index) => ({
							description: line.description,
							quantity: line.quantity,
							unitAmountCents: line.unitAmountCents,
							totalCents: line.quantity * line.unitAmountCents,
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
								totalCents: totals.subtotalCents,
								currency: input.currency,
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

	async updateInvoiceStatus(
		source: BusinessContextSource & { userId: string },
		input: { id: string; status: "SENT" | "VOID" },
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
					status === InvoiceLifecycleStatus.VOID ? new Date() : undefined,
				auditEvents: {
					create: {
						businessUnitId: context.businessUnitId,
						action:
							status === InvoiceLifecycleStatus.VOID
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
			this.weekRow(booking, base, expensesByBooking.get(booking.id) ?? []),
		);

		const labourIncluded =
			base === FINANCE.operatorLabour.currency.toUpperCase();
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
				operatorLabourCurrency: FINANCE.operatorLabour.currency,
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
			category: ExpenseCategory;
			amountCents: number;
			currency?: string;
			incurredAt: string;
			note?: string;
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

		const expense = await this.db.expense.create({
			data: {
				businessUnitId: context.businessUnitId,
				bookingId: input.bookingId ?? null,
				dealId: input.dealId ?? null,
				category: input.category,
				source: ExpenseSource.MANUAL,
				status: ExpenseStatus.RECORDED,
				amountCents: input.amountCents,
				currency: input.currency ?? base,
				incurredAt: dayDate(input.incurredAt),
				note: input.note ?? null,
				createdById: source.userId,
			},
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
				currency: true,
				payments: {
					where: { status: PaymentRecordStatus.MATCHED },
					select: { amountCents: true, currency: true },
				},
			},
		});
		const paidCents = invoice.payments
			.filter((payment) => payment.currency === invoice.currency)
			.reduce((total, payment) => total + payment.amountCents, 0);
		const balanceCents = Math.max(invoice.totalCents - paidCents, 0);
		const status =
			balanceCents === 0
				? InvoiceLifecycleStatus.PAID
				: paidCents > 0
					? InvoiceLifecycleStatus.PARTIALLY_PAID
					: invoice.status === InvoiceLifecycleStatus.VOID
						? InvoiceLifecycleStatus.VOID
						: invoice.status;

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
			},
		});
		const byBooking = new Map(
			existing.map((expense) => [expense.bookingId, expense]),
		);

		for (const booking of bookings) {
			const durationMinutes = bookingDurationMinutes(booking);
			const operatorCount = operatorCountOf(booking.resources);
			const costCents = operatorLabourCostCents(durationMinutes, operatorCount);
			const current = byBooking.get(booking.id);
			const derivedStatus =
				current?.status === ExpenseStatus.PAID
					? ExpenseStatus.PAID
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
				rateCents: operatorRateCents(durationMinutes),
			};

			const unchanged =
				current &&
				current.amountCents === costCents &&
				current.dealId === booking.dealId &&
				current.status === derivedStatus &&
				current.incurredAt.getTime() === booking.eventDate.getTime() &&
				parseExpenseEvidence(current.evidence)?.durationMinutes ===
					durationMinutes &&
				parseExpenseEvidence(current.evidence)?.operatorCount === operatorCount;

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
					currency: FINANCE.operatorLabour.currency,
					incurredAt: booking.eventDate,
					note: "Auto-calculated operator labour",
					evidence,
					calculationKey: `${CALCULATED_KEY_PREFIX}${booking.id}`,
				},
				update: {
					dealId: booking.dealId,
					amountCents: costCents,
					incurredAt: booking.eventDate,
					evidence,
					status: derivedStatus,
				},
			});
		}
	}

	private weekRow(
		booking: WeekBooking,
		base: string,
		expenses: ExpenseRow[],
	): FinanceWeekRowOutput {
		const deal = booking.deal;
		const durationMinutes = bookingDurationMinutes(booking);
		const operatorCount = operatorCountOf(booking.resources);
		const operatorCost = operatorLabourCostCents(
			durationMinutes,
			operatorCount,
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
				durationMinutes === null ? null : operatorRateCents(durationMinutes),
			operatorCostCents: operatorCost,
			estimatedLabourWithOneOperatorCents:
				operatorCost === null &&
				durationMinutes !== null &&
				operatorCount === null
					? operatorRateCents(durationMinutes)
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
		evidence: parseExpenseEvidence(expense.evidence),
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
		currency: quote.currency,
		subtotalCents: quote.subtotalCents,
		taxCents: quote.taxCents,
		totalCents: quote.totalCents,
		taxEnabled: quote.taxEnabled,
		taxRateBasisPoints: quote.taxRateBasisPoints,
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
		currency: invoice.currency,
		subtotalCents: invoice.subtotalCents,
		taxCents: invoice.taxCents,
		totalCents: invoice.totalCents,
		paidCents: invoice.paidCents,
		balanceCents: invoice.balanceCents,
		taxEnabled: invoice.taxEnabled,
		taxRateBasisPoints: invoice.taxRateBasisPoints,
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
		status: payment.status,
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
};

type LineTotals = {
	subtotalCents: number;
};

function lineTotals(lines: LineTotalInput[]): LineTotals {
	return {
		subtotalCents: lines.reduce(
			(total, line) => total + line.quantity * line.unitAmountCents,
			0,
		),
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
	if (status === FinanceDocumentStatus.VOID) return FinanceAuditAction.VOIDED;
	return FinanceAuditAction.UPDATED;
}

function dealQuoteStatusOf(status: FinanceDocumentStatus) {
	if (status === FinanceDocumentStatus.DECLINED) return "REJECTED" as const;
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
