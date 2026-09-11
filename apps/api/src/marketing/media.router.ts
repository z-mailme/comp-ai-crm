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
	archiveMediaInput,
	attachMediaInput,
	detachMediaInput,
	listMediaInput,
	mediaAssetOutput,
	mediaListOutput,
} from "./media.contracts";
import { MarketingMediaService } from "./media.service";

@Router({ alias: "marketingMedia" })
@UseMiddlewares(AuthMiddleware)
export class MarketingMediaRouter {
	constructor(
		@Inject(MarketingMediaService)
		private readonly media: MarketingMediaService,
	) {}

	@Query({
		input: listMediaInput,
		output: mediaListOutput,
		meta: restMeta("GET", "/marketing/media", ["Marketing"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listMediaInput>,
	) {
		return this.media.list(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: attachMediaInput,
		output: z.object({ ok: z.boolean() }),
		meta: restMeta("POST", "/marketing/media/attach", ["Marketing"]),
	})
	async attach(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof attachMediaInput>,
	) {
		return this.media.attach(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: detachMediaInput,
		output: z.object({ ok: z.boolean() }),
		meta: restMeta("POST", "/marketing/media/detach", ["Marketing"]),
	})
	async detach(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof detachMediaInput>,
	) {
		return this.media.detach(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: archiveMediaInput,
		output: mediaAssetOutput,
		meta: restMeta("POST", "/marketing/media/archive", ["Marketing"]),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof archiveMediaInput>,
	) {
		return this.media.archive(sourceOf(ctx, input), input);
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
