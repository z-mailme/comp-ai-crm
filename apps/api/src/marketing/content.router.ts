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
	aiAssistInput,
	contentByIdInput,
	contentDetailOutput,
	contentListOutput,
	contentOutput,
	createContentInput,
	decideContentInput,
	listContentInput,
	scheduleContentInput,
	updateContentInput,
} from "./content.contracts";
import { MarketingContentService } from "./content.service";

@Router({ alias: "marketingContent" })
@UseMiddlewares(AuthMiddleware)
export class MarketingContentRouter {
	constructor(
		@Inject(MarketingContentService)
		private readonly content: MarketingContentService,
	) {}

	@Query({
		input: listContentInput,
		output: contentListOutput,
		meta: restMeta("GET", "/marketing/content", ["Marketing"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listContentInput>,
	) {
		return this.content.list(sourceOf(ctx, input), input);
	}

	@Query({
		input: contentByIdInput,
		output: contentDetailOutput,
		meta: restMeta("GET", "/marketing/content/detail", ["Marketing"]),
	})
	async detail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contentByIdInput>,
	) {
		return this.content.detail(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: createContentInput,
		output: contentOutput,
		meta: restMeta("POST", "/marketing/content", ["Marketing"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createContentInput>,
	) {
		return this.content.create(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: updateContentInput,
		output: contentOutput,
		meta: restMeta("PATCH", "/marketing/content", ["Marketing"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateContentInput>,
	) {
		return this.content.update(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: contentByIdInput,
		output: contentOutput,
		meta: restMeta("POST", "/marketing/content/duplicate", ["Marketing"]),
	})
	async duplicate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contentByIdInput>,
	) {
		return this.content.duplicate(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: contentByIdInput,
		output: contentOutput,
		meta: restMeta("POST", "/marketing/content/archive", ["Marketing"]),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contentByIdInput>,
	) {
		return this.content.archive(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: contentByIdInput,
		output: z.object({
			content: contentOutput,
			approvalRequestId: z.string(),
		}),
		meta: restMeta("POST", "/marketing/content/submit-review", ["Marketing"]),
	})
	async submitForReview(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contentByIdInput>,
	) {
		return this.content.submitForReview(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: decideContentInput,
		output: contentOutput,
		meta: restMeta("POST", "/marketing/content/decide", ["Marketing"]),
	})
	async decide(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof decideContentInput>,
	) {
		return this.content.decide(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: scheduleContentInput,
		output: contentOutput,
		meta: restMeta("POST", "/marketing/content/schedule", ["Marketing"]),
	})
	async schedule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof scheduleContentInput>,
	) {
		return this.content.schedule(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: aiAssistInput,
		output: z.object({ queued: z.boolean() }),
		meta: restMeta("POST", "/marketing/content/ai-assist", ["Marketing"]),
	})
	async aiAssist(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof aiAssistInput>,
	) {
		return this.content.requestAiAssist(sourceOf(ctx, input), input);
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
