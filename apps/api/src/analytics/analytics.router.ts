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
	gaPropertiesOutput,
	gaReportOutput,
	gaStatusOutput,
	gaWindowInput,
	setGaPropertyInput,
} from "./analytics.contracts";
import { GoogleAnalyticsService } from "./analytics.service";

@Router({ alias: "googleAnalytics" })
@UseMiddlewares(AuthMiddleware)
export class GoogleAnalyticsRouter {
	constructor(
		@Inject(GoogleAnalyticsService)
		private readonly analytics: GoogleAnalyticsService,
	) {}

	@Query({
		output: gaStatusOutput,
		meta: restMeta("GET", "/google-analytics/status", ["Google Analytics"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.analytics.status(ctx.user.id);
	}

	@Query({
		output: gaPropertiesOutput,
		meta: restMeta("GET", "/google-analytics/properties", ["Google Analytics"]),
	})
	async properties(@Ctx() ctx: AuthedTrpcContext) {
		return this.analytics.properties(ctx.user.id);
	}

	@Mutation({
		input: setGaPropertyInput,
		output: gaStatusOutput,
		meta: restMeta("POST", "/google-analytics/property", ["Google Analytics"]),
	})
	async setProperty(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setGaPropertyInput>,
	) {
		return this.analytics.setProperty(ctx.user.id, input);
	}

	@Query({
		input: gaWindowInput,
		output: gaReportOutput,
		meta: restMeta("GET", "/google-analytics/report", ["Google Analytics"]),
	})
	async report(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof gaWindowInput>,
	) {
		return this.analytics.report(ctx.user.id, input);
	}
}
