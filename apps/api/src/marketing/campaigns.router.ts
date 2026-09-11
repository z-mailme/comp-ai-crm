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
	campaignByIdInput,
	campaignDetailOutput,
	campaignListOutput,
	campaignOutput,
	createCampaignInput,
	listCampaignsInput,
	sourceBreakdownOutput,
	updateCampaignInput,
} from "./campaigns.contracts";
import { MarketingCampaignsService } from "./campaigns.service";

@Router({ alias: "marketingCampaigns" })
@UseMiddlewares(AuthMiddleware)
export class MarketingCampaignsRouter {
	constructor(
		@Inject(MarketingCampaignsService)
		private readonly campaigns: MarketingCampaignsService,
	) {}

	@Query({
		input: listCampaignsInput,
		output: campaignListOutput,
		meta: restMeta("GET", "/marketing/campaigns", ["Marketing"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listCampaignsInput>,
	) {
		return this.campaigns.list(sourceOf(ctx, input), input);
	}

	@Query({
		input: campaignByIdInput,
		output: campaignDetailOutput,
		meta: restMeta("GET", "/marketing/campaigns/detail", ["Marketing"]),
	})
	async detail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof campaignByIdInput>,
	) {
		return this.campaigns.detail(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: createCampaignInput,
		output: campaignOutput,
		meta: restMeta("POST", "/marketing/campaigns", ["Marketing"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createCampaignInput>,
	) {
		return this.campaigns.create(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: updateCampaignInput,
		output: campaignOutput,
		meta: restMeta("PATCH", "/marketing/campaigns", ["Marketing"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateCampaignInput>,
	) {
		return this.campaigns.update(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: z.object({ id: z.string().trim().min(1) }),
		output: campaignOutput,
		meta: restMeta("POST", "/marketing/campaigns/archive", ["Marketing"]),
	})
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input() input: { id: string }) {
		return this.campaigns.archive(sourceOf(ctx), input);
	}

	@Query({
		input: z.object({
			businessUnitId: z.string().trim().min(1).optional(),
			from: z.string().datetime({ offset: true }).optional(),
			to: z.string().datetime({ offset: true }).optional(),
		}),
		output: sourceBreakdownOutput,
		meta: restMeta("GET", "/marketing/attribution/sources", ["Marketing"]),
	})
	async sources(
		@Ctx() ctx: AuthedTrpcContext,
		@Input()
		input: { businessUnitId?: string; from?: string; to?: string },
	) {
		return this.campaigns.sourceBreakdown(sourceOf(ctx, input), input);
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
