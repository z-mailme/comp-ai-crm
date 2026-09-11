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
	archiveEmailTemplateInput,
	composeEmailCampaignInput,
	createEmailTemplateInput,
	emailCampaignOutput,
	emailCreateListInput,
	emailListOutput,
	emailScheduleDecideInput,
	emailScheduleOutput,
	emailScheduleRequestInput,
	emailSubscribersInput,
	emailSubscribersOutput,
	emailSyncListInput,
	emailSyncOutput,
	emailTemplateByIdInput,
	emailTemplateContextInput,
	emailTemplateListOutput,
	emailTemplateOutput,
	emailTemplateRenderOutput,
	updateEmailTemplateInput,
} from "./email.contracts";
import { MarketingEmailService } from "./email.service";

@Router({ alias: "marketingEmail" })
@UseMiddlewares(AuthMiddleware)
export class MarketingEmailRouter {
	constructor(
		@Inject(MarketingEmailService)
		private readonly email: MarketingEmailService,
	) {}

	@Query({
		input: emailTemplateContextInput,
		output: emailTemplateListOutput,
		meta: restMeta("GET", "/marketing/email/templates", ["Marketing"]),
	})
	async templates(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailTemplateContextInput>,
	) {
		return this.email.templates(sourceOf(ctx, input));
	}

	@Mutation({
		input: createEmailTemplateInput,
		output: emailTemplateOutput,
		meta: restMeta("POST", "/marketing/email/templates", ["Marketing"]),
	})
	async createTemplate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createEmailTemplateInput>,
	) {
		return this.email.createTemplate(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: updateEmailTemplateInput,
		output: emailTemplateOutput,
		meta: restMeta("POST", "/marketing/email/templates/update", ["Marketing"]),
	})
	async updateTemplate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateEmailTemplateInput>,
	) {
		return this.email.updateTemplate(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: archiveEmailTemplateInput,
		output: emailTemplateOutput,
		meta: restMeta("POST", "/marketing/email/templates/archive", ["Marketing"]),
	})
	async archiveTemplate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof archiveEmailTemplateInput>,
	) {
		return this.email.archiveTemplate(sourceOf(ctx, input), input);
	}

	@Query({
		input: emailTemplateByIdInput,
		output: emailTemplateRenderOutput,
		meta: restMeta("GET", "/marketing/email/templates/render", ["Marketing"]),
	})
	async renderTemplate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailTemplateByIdInput>,
	) {
		return this.email.renderTemplate(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: composeEmailCampaignInput,
		output: emailCampaignOutput,
		meta: restMeta("POST", "/marketing/email/campaigns", ["Marketing"]),
	})
	async composeCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof composeEmailCampaignInput>,
	) {
		return this.email.composeCampaign(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: emailScheduleRequestInput,
		output: emailScheduleOutput,
		meta: restMeta("POST", "/marketing/email/schedule/request", ["Marketing"]),
	})
	async requestSchedule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailScheduleRequestInput>,
	) {
		return this.email.requestSchedule(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: emailScheduleDecideInput,
		output: emailScheduleOutput,
		meta: restMeta("POST", "/marketing/email/schedule/decide", ["Marketing"]),
	})
	async decideSchedule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailScheduleDecideInput>,
	) {
		return this.email.decideSchedule(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: emailCreateListInput,
		output: emailListOutput,
		meta: restMeta("POST", "/marketing/email/lists", ["Marketing"]),
	})
	async createList(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailCreateListInput>,
	) {
		return this.email.createList(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: emailSyncListInput,
		output: emailSyncOutput,
		meta: restMeta("POST", "/marketing/email/lists/sync", ["Marketing"]),
	})
	async syncList(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailSyncListInput>,
	) {
		return this.email.syncList(sourceOf(ctx, input), input);
	}

	@Query({
		input: emailSubscribersInput,
		output: emailSubscribersOutput,
		meta: restMeta("GET", "/marketing/email/subscribers", ["Marketing"]),
	})
	async subscribers(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof emailSubscribersInput>,
	) {
		return this.email.subscribers(sourceOf(ctx, input), input);
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
