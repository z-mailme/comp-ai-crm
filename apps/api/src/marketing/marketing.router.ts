import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	adsConnectionInput,
	adsWorkspaceOutput,
	approvalRequestOutput,
	createListmonkCampaignInput,
	createListmonkCampaignOutput,
	emailMarketingOutput,
	listmonkConnectionInput,
	marketingContextInput,
	marketingIntegrationOutput,
	marketingOverviewOutput,
	marketingProviderInput,
	performanceSummaryInput,
	performanceSummaryOutput,
	requestMarketingActionInput,
	sendListmonkTestInput,
	syncAdsInput,
	syncAdsOutput,
} from "./marketing.contracts";
import { MarketingService } from "./marketing.service";

@Router({ alias: "marketing" })
@UseMiddlewares(AuthMiddleware)
export class MarketingRouter {
	constructor(
		@Inject(MarketingService) private readonly marketing: MarketingService,
	) {}

	@Query({
		input: marketingContextInput,
		output: marketingOverviewOutput,
		meta: restMeta("GET", "/marketing/overview", ["Marketing"]),
	})
	async overview(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingContextInput>,
	) {
		return this.marketing.overview(sourceOf(ctx, input), input);
	}

	@Query({
		input: marketingContextInput,
		output: emailMarketingOutput,
		meta: restMeta("GET", "/marketing/email", ["Marketing"]),
	})
	async email(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingContextInput>,
	) {
		return this.marketing.email(sourceOf(ctx, input), input);
	}

	@Query({
		input: marketingContextInput,
		output: adsWorkspaceOutput,
		meta: restMeta("GET", "/marketing/google-ads", ["Marketing"]),
	})
	async googleAds(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingContextInput>,
	) {
		return this.marketing.googleAds(sourceOf(ctx, input), input);
	}

	@Query({
		input: marketingContextInput,
		output: adsWorkspaceOutput,
		meta: restMeta("GET", "/marketing/meta-ads", ["Marketing"]),
	})
	async metaAds(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingContextInput>,
	) {
		return this.marketing.metaAds(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: listmonkConnectionInput,
		output: marketingIntegrationOutput,
		meta: restMeta("POST", "/marketing/listmonk/connect", ["Marketing"]),
	})
	async connectListmonk(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listmonkConnectionInput>,
	) {
		return this.marketing.connectListmonk(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: adsConnectionInput,
		output: marketingIntegrationOutput,
		meta: restMeta("POST", "/marketing/ads/connect", ["Marketing"]),
	})
	async connectAds(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof adsConnectionInput>,
	) {
		return this.marketing.connectAds(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: marketingProviderInput,
		output: marketingIntegrationOutput,
		meta: restMeta("POST", "/marketing/disconnect", ["Marketing"]),
	})
	async disconnect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingProviderInput>,
	) {
		return this.marketing.disconnect(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: createListmonkCampaignInput,
		output: createListmonkCampaignOutput,
		meta: restMeta("POST", "/marketing/listmonk/campaigns", ["Marketing"]),
	})
	async createListmonkCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createListmonkCampaignInput>,
	) {
		return this.marketing.createListmonkCampaign(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: sendListmonkTestInput,
		output: z.object({ ok: z.boolean() }),
		meta: restMeta("POST", "/marketing/listmonk/campaigns/test", ["Marketing"]),
	})
	async sendListmonkTest(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendListmonkTestInput>,
	) {
		return this.marketing.sendListmonkTest(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: requestMarketingActionInput,
		output: approvalRequestOutput,
		meta: restMeta("POST", "/marketing/approvals", ["Marketing"]),
	})
	async requestAction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof requestMarketingActionInput>,
	) {
		return this.marketing.requestAction(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: syncAdsInput,
		output: syncAdsOutput,
		meta: restMeta("POST", "/marketing/ads/sync", ["Marketing"]),
	})
	async syncAds(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof syncAdsInput>,
	) {
		return this.marketing.syncAds(sourceOf(ctx, input), input);
	}

	@Query({
		input: performanceSummaryInput,
		output: performanceSummaryOutput,
		meta: restMeta("GET", "/marketing/performance", ["Marketing"]),
	})
	async performanceSummary(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof performanceSummaryInput>,
	) {
		return this.marketing.performanceSummary(sourceOf(ctx, input), input);
	}
}

function sourceOf(ctx: AuthedTrpcContext, input?: { businessUnitId?: string }) {
	return {
		userId: ctx.user.id,
		businessUnitId: input?.businessUnitId ?? businessUnitHeader(ctx),
	};
}

function businessUnitHeader(ctx: AuthedTrpcContext): string | null {
	const value = ctx.req?.headers["x-business-unit-id"];
	if (Array.isArray(value)) return value[0] ?? null;
	return value ?? null;
}
