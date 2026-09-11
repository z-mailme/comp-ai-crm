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
	dashboardLayoutOutput,
	dashboardSummaryInput,
	dashboardSummaryOutput,
	saveDashboardLayoutInput,
} from "./dashboard.contracts";
import { DashboardService } from "./dashboard.service";

@Router({ alias: "dashboard" })
@UseMiddlewares(AuthMiddleware)
export class DashboardRouter {
	constructor(
		@Inject(DashboardService) private readonly dashboard: DashboardService,
	) {}

	@Query({
		output: dashboardLayoutOutput,
		meta: restMeta("GET", "/dashboard/layout", ["Dashboard"]),
	})
	async layout(@Ctx() ctx: AuthedTrpcContext) {
		return this.dashboard.layout(ctx.user.id);
	}

	@Mutation({
		input: saveDashboardLayoutInput,
		output: dashboardLayoutOutput,
		meta: restMeta("PUT", "/dashboard/layout", ["Dashboard"]),
	})
	async saveLayout(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveDashboardLayoutInput>,
	) {
		return this.dashboard.saveLayout(ctx.user.id, input.layout);
	}

	@Query({
		input: dashboardSummaryInput,
		output: dashboardSummaryOutput,
		meta: restMeta("GET", "/dashboard/summary", ["Dashboard"]),
	})
	async summary(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardSummaryInput>,
	) {
		return this.dashboard.summary(ctx.user.id, input);
	}
}
