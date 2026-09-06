import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	approvalsOutput,
	businessContextInput,
	businessOsOverviewOutput,
	calendarInput,
	calendarOutput,
	conversationDetailOutput,
	conversationInput,
	customer360Input,
	customer360Output,
	globalSearchInput,
	globalSearchOutput,
	inboxInput,
	inboxOutput,
	knowledgeOutput,
	observabilityOutput,
} from "./business-os.contracts";
import { BusinessOsService } from "./business-os.service";

@Router({ alias: "businessOs" })
@UseMiddlewares(AuthMiddleware)
export class BusinessOsRouter {
	constructor(
		@Inject(BusinessOsService) private readonly businessOs: BusinessOsService,
	) {}

	@Query({
		input: businessContextInput,
		output: businessOsOverviewOutput,
		meta: restMeta("GET", "/business-os/overview", ["Business OS"]),
	})
	async overview(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessContextInput>,
	) {
		return this.businessOs.overview(sourceOf(ctx, input));
	}

	@Query({
		input: inboxInput,
		output: inboxOutput,
		meta: restMeta("GET", "/business-os/inbox", ["Business OS"]),
	})
	async inbox(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof inboxInput>,
	) {
		return this.businessOs.inbox(sourceOf(ctx, input), input);
	}

	@Query({
		input: calendarInput,
		output: calendarOutput,
		meta: restMeta("GET", "/business-os/calendar", ["Business OS"]),
	})
	async calendar(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof calendarInput>,
	) {
		return this.businessOs.calendar(sourceOf(ctx, input), input);
	}

	@Query({
		input: conversationInput,
		output: conversationDetailOutput,
		meta: restMeta("GET", "/business-os/conversations/{id}", ["Business OS"]),
	})
	async conversation(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationInput>,
	) {
		return this.businessOs.conversation(sourceOf(ctx, input), input.id);
	}

	@Query({
		input: customer360Input,
		output: customer360Output,
		meta: restMeta("GET", "/business-os/customer-360/{contactId}", [
			"Business OS",
		]),
	})
	async customer360(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof customer360Input>,
	) {
		return this.businessOs.customer360(sourceOf(ctx, input), input.contactId);
	}

	@Query({
		input: globalSearchInput,
		output: globalSearchOutput,
		meta: restMeta("GET", "/business-os/search", ["Business OS"]),
	})
	async globalSearch(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof globalSearchInput>,
	) {
		return this.businessOs.globalSearch(sourceOf(ctx, input), input);
	}

	@Query({
		input: businessContextInput,
		output: approvalsOutput,
		meta: restMeta("GET", "/business-os/approvals", ["Business OS"]),
	})
	async approvals(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessContextInput>,
	) {
		return this.businessOs.approvals(sourceOf(ctx, input));
	}

	@Query({
		input: businessContextInput,
		output: knowledgeOutput,
		meta: restMeta("GET", "/business-os/knowledge", ["Business OS"]),
	})
	async knowledge(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessContextInput>,
	) {
		return this.businessOs.knowledge(sourceOf(ctx, input));
	}

	@Query({
		input: businessContextInput,
		output: observabilityOutput,
		meta: restMeta("GET", "/business-os/observability", ["Business OS"]),
	})
	async observability(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessContextInput>,
	) {
		return this.businessOs.observability(sourceOf(ctx, input));
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
