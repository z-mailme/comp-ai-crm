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
	audienceByIdInput,
	audienceContextInput,
	audienceCountInput,
	audienceCountOutput,
	audienceExportInput,
	audienceExportOutput,
	audienceListOutput,
	audienceOutput,
	createAudienceInput,
	updateAudienceInput,
} from "./audiences.contracts";
import { MarketingAudiencesService } from "./audiences.service";

@Router({ alias: "marketingAudiences" })
@UseMiddlewares(AuthMiddleware)
export class MarketingAudiencesRouter {
	constructor(
		@Inject(MarketingAudiencesService)
		private readonly audiences: MarketingAudiencesService,
	) {}

	@Query({
		input: audienceContextInput,
		output: audienceListOutput,
		meta: restMeta("GET", "/marketing/audiences", ["Marketing"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof audienceContextInput>,
	) {
		return this.audiences.list(sourceOf(ctx, input));
	}

	@Mutation({
		input: audienceCountInput,
		output: audienceCountOutput,
		meta: restMeta("POST", "/marketing/audiences/count", ["Marketing"]),
	})
	async count(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof audienceCountInput>,
	) {
		return this.audiences.count(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: createAudienceInput,
		output: audienceOutput,
		meta: restMeta("POST", "/marketing/audiences", ["Marketing"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createAudienceInput>,
	) {
		return this.audiences.create(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: updateAudienceInput,
		output: audienceOutput,
		meta: restMeta("POST", "/marketing/audiences/update", ["Marketing"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateAudienceInput>,
	) {
		return this.audiences.update(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: audienceByIdInput,
		output: audienceOutput,
		meta: restMeta("POST", "/marketing/audiences/archive", ["Marketing"]),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof audienceByIdInput>,
	) {
		return this.audiences.archive(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: audienceExportInput,
		output: audienceExportOutput,
		meta: restMeta("POST", "/marketing/audiences/export", ["Marketing"]),
	})
	async exportToList(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof audienceExportInput>,
	) {
		return this.audiences.exportToList(sourceOf(ctx, input), input);
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
