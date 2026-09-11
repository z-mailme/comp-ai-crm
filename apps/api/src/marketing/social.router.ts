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
	accountByIdInput,
	accountListOutput,
	accountOutput,
	createPostInput,
	decidePostInput,
	listAccountsInput,
	listPostsInput,
	postByIdInput,
	postListOutput,
	postOutput,
	registerAccountInput,
	schedulePostInput,
	socialCalendarInput,
	socialCalendarOutput,
	socialInboxOutput,
} from "./social.contracts";
import { MarketingSocialService } from "./social.service";

@Router({ alias: "marketingSocial" })
@UseMiddlewares(AuthMiddleware)
export class MarketingSocialRouter {
	constructor(
		@Inject(MarketingSocialService)
		private readonly social: MarketingSocialService,
	) {}

	@Query({
		input: listAccountsInput,
		output: accountListOutput,
		meta: restMeta("GET", "/marketing/social/accounts", ["Marketing"]),
	})
	async accounts(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listAccountsInput>,
	) {
		return this.social.listAccounts(sourceOf(ctx, input));
	}

	@Mutation({
		input: registerAccountInput,
		output: accountOutput,
		meta: restMeta("POST", "/marketing/social/accounts", ["Marketing"]),
	})
	async registerAccount(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof registerAccountInput>,
	) {
		return this.social.registerAccount(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: accountByIdInput,
		output: accountOutput,
		meta: restMeta("POST", "/marketing/social/accounts/disconnect", [
			"Marketing",
		]),
	})
	async disconnectAccount(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof accountByIdInput>,
	) {
		return this.social.disconnectAccount(sourceOf(ctx, input), input);
	}

	@Query({
		input: listPostsInput,
		output: postListOutput,
		meta: restMeta("GET", "/marketing/social/posts", ["Marketing"]),
	})
	async posts(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listPostsInput>,
	) {
		return this.social.listPosts(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: createPostInput,
		output: postOutput,
		meta: restMeta("POST", "/marketing/social/posts", ["Marketing"]),
	})
	async createPost(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createPostInput>,
	) {
		return this.social.createPost(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: postByIdInput,
		output: z.object({
			post: postOutput,
			approvalRequestId: z.string(),
		}),
		meta: restMeta("POST", "/marketing/social/posts/submit-approval", [
			"Marketing",
		]),
	})
	async submitForApproval(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof postByIdInput>,
	) {
		return this.social.submitForApproval(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: decidePostInput,
		output: postOutput,
		meta: restMeta("POST", "/marketing/social/posts/decide", ["Marketing"]),
	})
	async decide(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof decidePostInput>,
	) {
		return this.social.decide(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: schedulePostInput,
		output: postOutput,
		meta: restMeta("POST", "/marketing/social/posts/schedule", ["Marketing"]),
	})
	async schedule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof schedulePostInput>,
	) {
		return this.social.schedule(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: postByIdInput,
		output: postOutput,
		meta: restMeta("POST", "/marketing/social/posts/publish", ["Marketing"]),
	})
	async publish(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof postByIdInput>,
	) {
		return this.social.publish(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: postByIdInput,
		output: postOutput,
		meta: restMeta("POST", "/marketing/social/posts/cancel", ["Marketing"]),
	})
	async cancel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof postByIdInput>,
	) {
		return this.social.cancel(sourceOf(ctx, input), input);
	}

	@Query({
		input: socialCalendarInput,
		output: socialCalendarOutput,
		meta: restMeta("GET", "/marketing/social/calendar", ["Marketing"]),
	})
	async calendar(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof socialCalendarInput>,
	) {
		return this.social.calendar(sourceOf(ctx, input), input);
	}

	@Query({
		input: listAccountsInput,
		output: socialInboxOutput,
		meta: restMeta("GET", "/marketing/social/inbox", ["Marketing"]),
	})
	async inbox(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof listAccountsInput>,
	) {
		return this.social.inbox(sourceOf(ctx, input));
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
