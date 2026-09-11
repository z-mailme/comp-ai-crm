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
	addExpenseInput,
	cancelExpenseInput,
	expenseMutationOutput,
	financeWeekInput,
	financeWeekOutput,
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
}
