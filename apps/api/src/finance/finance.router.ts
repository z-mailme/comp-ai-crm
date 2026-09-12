import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	accountingOutput,
	addExpenseInput,
	cancelExpenseInput,
	expenseMutationOutput,
	financeDashboardInput,
	financeDashboardOutput,
	financeListInput,
	financeWeekInput,
	financeWeekOutput,
	invoiceCreateInput,
	invoiceListOutput,
	invoiceMutationOutput,
	invoiceStatusInput,
	markExpensePaidInput,
	paymentCreateInput,
	paymentListOutput,
	paymentMatchInput,
	paymentMutationOutput,
	quoteCreateInput,
	quoteListOutput,
	quoteMutationOutput,
	quoteStatusInput,
} from "./finance.contracts";
import { FinanceService } from "./finance.service";

@Router({ alias: "finance" })
@UseMiddlewares(AuthMiddleware)
export class FinanceRouter {
	constructor(
		@Inject(FinanceService) private readonly finance: FinanceService,
	) {}

	@Query({
		input: financeWeekInput,
		output: financeWeekOutput,
		meta: restMeta("GET", "/finance/week", ["Finance"]),
	})
	async week(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeWeekInput>,
	) {
		return this.finance.week(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Query({
		input: financeDashboardInput,
		output: financeDashboardOutput,
		meta: restMeta("GET", "/finance/dashboard", ["Finance"]),
	})
	async dashboard(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeDashboardInput>,
	) {
		return this.finance.dashboard({
			userId: ctx.user.id,
			businessUnitId: input.businessUnitId,
		});
	}

	@Query({
		input: financeListInput,
		output: quoteListOutput,
		meta: restMeta("GET", "/finance/quotes", ["Finance"]),
	})
	async quotes(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeListInput>,
	) {
		return this.finance.quotes(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Mutation({
		input: quoteCreateInput,
		output: quoteMutationOutput,
		meta: restMeta("POST", "/finance/quotes", ["Finance"]),
	})
	async createQuote(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof quoteCreateInput>,
	) {
		return this.finance.createQuote({ userId: ctx.user.id }, input);
	}

	@Mutation({
		input: quoteStatusInput,
		output: quoteMutationOutput,
		meta: restMeta("POST", "/finance/quotes/status", ["Finance"]),
	})
	async updateQuoteStatus(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof quoteStatusInput>,
	) {
		return this.finance.updateQuoteStatus(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Query({
		input: financeListInput,
		output: invoiceListOutput,
		meta: restMeta("GET", "/finance/invoices", ["Finance"]),
	})
	async invoices(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeListInput>,
	) {
		return this.finance.invoices(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Mutation({
		input: invoiceCreateInput,
		output: invoiceMutationOutput,
		meta: restMeta("POST", "/finance/invoices", ["Finance"]),
	})
	async createInvoice(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof invoiceCreateInput>,
	) {
		return this.finance.createInvoice({ userId: ctx.user.id }, input);
	}

	@Mutation({
		input: invoiceStatusInput,
		output: invoiceMutationOutput,
		meta: restMeta("POST", "/finance/invoices/status", ["Finance"]),
	})
	async updateInvoiceStatus(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof invoiceStatusInput>,
	) {
		return this.finance.updateInvoiceStatus(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Query({
		input: financeListInput,
		output: paymentListOutput,
		meta: restMeta("GET", "/finance/payments", ["Finance"]),
	})
	async payments(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeListInput>,
	) {
		return this.finance.payments(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Mutation({
		input: paymentCreateInput,
		output: paymentMutationOutput,
		meta: restMeta("POST", "/finance/payments", ["Finance"]),
	})
	async createPayment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof paymentCreateInput>,
	) {
		return this.finance.createPayment({ userId: ctx.user.id }, input);
	}

	@Mutation({
		input: paymentMatchInput,
		output: paymentMutationOutput,
		meta: restMeta("POST", "/finance/payments/match", ["Finance"]),
	})
	async matchPayment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof paymentMatchInput>,
	) {
		return this.finance.matchPayment(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}

	@Query({
		input: financeDashboardInput,
		output: accountingOutput,
		meta: restMeta("GET", "/finance/accounting", ["Finance"]),
	})
	async accounting(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof financeDashboardInput>,
	) {
		return this.finance.accounting({
			userId: ctx.user.id,
			businessUnitId: input.businessUnitId,
		});
	}

	@Mutation({
		input: addExpenseInput,
		output: expenseMutationOutput,
		meta: restMeta("POST", "/finance/expenses", ["Finance"]),
	})
	async addExpense(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addExpenseInput>,
	) {
		return this.finance.addExpense({ userId: ctx.user.id }, input);
	}

	@Mutation({
		input: cancelExpenseInput,
		output: expenseMutationOutput,
		meta: restMeta("POST", "/finance/expenses/cancel", ["Finance"]),
	})
	async cancelExpense(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof cancelExpenseInput>,
	) {
		return this.finance.cancelExpense({ userId: ctx.user.id }, input);
	}

	@Mutation({
		input: markExpensePaidInput,
		output: expenseMutationOutput,
		meta: restMeta("POST", "/finance/expenses/mark-paid", ["Finance"]),
	})
	async markExpensePaid(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof markExpensePaidInput>,
	) {
		return this.finance.markExpensePaid(
			{ userId: ctx.user.id, businessUnitId: input.businessUnitId },
			input,
		);
	}
}
