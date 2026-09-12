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
	approvalStatusInput,
	approvalStatusOutput,
	automationConfigInput,
	automationConfigOutput,
	automationContentOutput,
	automationPlanInput,
	automationPlanOutput,
	automationUpsertContentInput,
	brainContextInput,
	brainContextOutput,
	canvaRenderOutput,
	decideApprovalInput,
	driveAssetOutput,
	mediaSelectionOutput,
	mediaSelectionRequestInput,
	metricOutput,
	publishAttemptOutput,
	publishResultInput,
	recordFailureInput,
	recordPostIdsInput,
	recordUsageInput,
	registerDriveAssetInput,
	saveCopyInput,
	saveMetricsInput,
	saveRenderInput,
	sendApprovalInput,
	updateAutomationConfigInput,
} from "./automation.contracts";
import { MarketingAutomationService } from "./automation.service";

@Router({ alias: "marketingAutomation" })
@UseMiddlewares(AuthMiddleware)
export class MarketingAutomationRouter {
	constructor(
		@Inject(MarketingAutomationService)
		private readonly automation: MarketingAutomationService,
	) {}

	@Query({
		input: automationConfigInput,
		output: automationConfigOutput,
		meta: restMeta("GET", "/marketing/automation/config", ["Marketing"]),
	})
	async config(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationConfigInput>,
	) {
		return this.automation.config(sourceOf(ctx, input));
	}

	@Mutation({
		input: updateAutomationConfigInput,
		output: automationConfigOutput,
		meta: restMeta("POST", "/marketing/automation/config", ["Marketing"]),
	})
	async updateConfig(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateAutomationConfigInput>,
	) {
		return this.automation.updateConfig(sourceOf(ctx, input), input);
	}

	@Query({
		input: automationPlanInput,
		output: automationPlanOutput,
		meta: restMeta("GET", "/marketing/automation/plan", ["Marketing"]),
	})
	async plan(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationPlanInput>,
	) {
		return this.automation.plan(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: automationUpsertContentInput,
		output: automationContentOutput,
		meta: restMeta("POST", "/marketing/automation/content", ["Marketing"]),
	})
	async upsertContent(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationUpsertContentInput>,
	) {
		return this.automation.upsertContent(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: mediaSelectionRequestInput,
		output: mediaSelectionOutput,
		meta: restMeta("POST", "/marketing/automation/media/request", [
			"Marketing",
		]),
	})
	async requestMedia(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mediaSelectionRequestInput>,
	) {
		return this.automation.requestMedia(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: registerDriveAssetInput,
		output: driveAssetOutput,
		meta: restMeta("POST", "/marketing/automation/media/register", [
			"Marketing",
		]),
	})
	async registerAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof registerDriveAssetInput>,
	) {
		return this.automation.registerAsset(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: saveCopyInput,
		output: automationContentOutput,
		meta: restMeta("POST", "/marketing/automation/content/copy", ["Marketing"]),
	})
	async saveCopy(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveCopyInput>,
	) {
		return this.automation.saveCopy(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: saveRenderInput,
		output: canvaRenderOutput,
		meta: restMeta("POST", "/marketing/automation/design", ["Marketing"]),
	})
	async saveRender(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveRenderInput>,
	) {
		return this.automation.saveRender(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: sendApprovalInput,
		output: approvalStatusOutput,
		meta: restMeta("POST", "/marketing/automation/approval/send", [
			"Marketing",
		]),
	})
	async sendApproval(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendApprovalInput>,
	) {
		return this.automation.sendApproval(sourceOf(ctx, input), input);
	}

	@Query({
		input: approvalStatusInput,
		output: approvalStatusOutput,
		meta: restMeta("GET", "/marketing/automation/approval/status", [
			"Marketing",
		]),
	})
	async approvalStatus(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalStatusInput>,
	) {
		return this.automation.approvalStatus(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: decideApprovalInput,
		output: approvalStatusOutput,
		meta: restMeta("POST", "/marketing/automation/approval/decide", [
			"Marketing",
		]),
	})
	async decideApproval(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof decideApprovalInput>,
	) {
		return this.automation.decideApproval(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: publishResultInput,
		output: publishAttemptOutput,
		meta: restMeta("POST", "/marketing/automation/publish/result", [
			"Marketing",
		]),
	})
	async publishResult(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof publishResultInput>,
	) {
		return this.automation.publishResult(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: recordPostIdsInput,
		output: z.object({ ok: z.boolean() }),
		meta: restMeta("POST", "/marketing/automation/publish/post-ids", [
			"Marketing",
		]),
	})
	async recordPostIds(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof recordPostIdsInput>,
	) {
		return this.automation.recordPostIds(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: recordFailureInput,
		output: publishAttemptOutput,
		meta: restMeta("POST", "/marketing/automation/publish/failure", [
			"Marketing",
		]),
	})
	async recordFailure(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof recordFailureInput>,
	) {
		return this.automation.recordFailure(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: saveMetricsInput,
		output: metricOutput,
		meta: restMeta("POST", "/marketing/automation/analytics", ["Marketing"]),
	})
	async saveMetrics(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveMetricsInput>,
	) {
		return this.automation.saveMetrics(sourceOf(ctx, input), input);
	}

	@Mutation({
		input: recordUsageInput,
		output: z.object({
			id: z.string(),
			assetId: z.string(),
			replayed: z.boolean(),
		}),
		meta: restMeta("POST", "/marketing/automation/media/usage", ["Marketing"]),
	})
	async recordUsage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof recordUsageInput>,
	) {
		return this.automation.recordUsage(sourceOf(ctx, input), input);
	}

	@Query({
		input: brainContextInput,
		output: brainContextOutput,
		meta: restMeta("GET", "/marketing/automation/brain-context", ["Marketing"]),
	})
	async brainContext(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof brainContextInput>,
	) {
		return this.automation.brainContext(sourceOf(ctx, input), input);
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
