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
	brainJobOutput,
	brainKnowledgeOutput,
	brainKnowledgeQueryInput,
} from "./brain.contracts";
import { BrainService } from "./brain.service";

@Router({ alias: "brain" })
@UseMiddlewares(AuthMiddleware)
export class BrainRouter {
	constructor(@Inject(BrainService) private readonly brain: BrainService) {}

	@Query({
		output: brainJobOutput,
		meta: restMeta("GET", "/brain/job", ["Brain"]),
	})
	async job(@Ctx() ctx: AuthedTrpcContext) {
		return this.brain.latest(ctx.user.id);
	}

	@Mutation({
		output: brainJobOutput,
		meta: restMeta("POST", "/brain/job/start", ["Brain"]),
	})
	async start(@Ctx() ctx: AuthedTrpcContext) {
		return this.brain.start(ctx.user.id);
	}

	@Mutation({
		output: brainJobOutput,
		meta: restMeta("POST", "/brain/job/pause", ["Brain"]),
	})
	async pause(@Ctx() ctx: AuthedTrpcContext) {
		return this.brain.pause(ctx.user.id);
	}

	@Mutation({
		output: brainJobOutput,
		meta: restMeta("POST", "/brain/job/resume", ["Brain"]),
	})
	async resume(@Ctx() ctx: AuthedTrpcContext) {
		return this.brain.resume(ctx.user.id);
	}

	@Mutation({
		output: brainJobOutput,
		meta: restMeta("POST", "/brain/job/cancel", ["Brain"]),
	})
	async cancel(@Ctx() ctx: AuthedTrpcContext) {
		return this.brain.cancel(ctx.user.id);
	}

	@Query({
		input: brainKnowledgeQueryInput,
		output: brainKnowledgeOutput.array(),
		meta: restMeta("GET", "/brain/knowledge", ["Brain"]),
	})
	async knowledge(@Input() input: z.infer<typeof brainKnowledgeQueryInput>) {
		return this.brain.knowledge(input);
	}
}
