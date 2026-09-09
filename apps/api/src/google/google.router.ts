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
import { ConversationService } from "./conversation.service";
import { GmailHistoricalImportService } from "./gmail-historical-import.service";
import { GmailLabelSyncService } from "./gmail-label-sync.service";
import { GmailModifyService } from "./gmail-modify.service";
import { GmailSendService } from "./gmail-send.service";
import {
	calendarEventInput,
	calendarEventOutput,
	createHistoricalImportInput,
	emailThreadOutput,
	gmailLabelOutput,
	googleConnectionStatusOutput,
	historicalImportIdInput,
	historicalImportJobOutput,
	mailboxActionInput,
	mailboxActionOutput,
	mailboxThreadsInput,
	mailboxThreadsOutput,
	purgeSyncedDataOutput,
	reindexCalendarInput,
	reindexCalendarOutput,
	revokeAccessOutput,
	sendEmailInput,
	sendEmailOutput,
	setAutoCreateInput,
	suppressDomainInput,
	suppressDomainOutput,
	threadInput,
} from "./google.contracts";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleSyncService } from "./google-sync.service";
import { MailboxListService } from "./mailbox-list.service";

@Router({ alias: "google" })
@UseMiddlewares(AuthMiddleware)
export class GoogleRouter {
	constructor(
		@Inject(GoogleConnectionService)
		private readonly connection: GoogleConnectionService,
		@Inject(GoogleSyncService) private readonly sync: GoogleSyncService,
		@Inject(GmailHistoricalImportService)
		private readonly historicalImportsService: GmailHistoricalImportService,
		@Inject(ConversationService)
		private readonly conversations: ConversationService,
		@Inject(GmailSendService)
		private readonly gmailSend: GmailSendService,
		@Inject(GmailLabelSyncService)
		private readonly labels: GmailLabelSyncService,
		@Inject(MailboxListService)
		private readonly mailboxList: MailboxListService,
		@Inject(GmailModifyService)
		private readonly modify: GmailModifyService,
	) {}

	@Query({
		output: gmailLabelOutput.array(),
		meta: restMeta("GET", "/google/gmail/labels", ["Google"]),
	})
	async gmailLabels(@Ctx() ctx: AuthedTrpcContext) {
		return this.labels.listForUser(ctx.user.id);
	}

	@Query({
		input: mailboxThreadsInput,
		output: mailboxThreadsOutput,
		meta: restMeta("GET", "/google/gmail/threads", ["Google"]),
	})
	async mailboxThreads(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mailboxThreadsInput>,
	) {
		return this.mailboxList.threads(ctx.user.id, input);
	}

	@Mutation({
		input: mailboxActionInput,
		output: mailboxActionOutput,
		meta: restMeta("POST", "/google/gmail/actions", ["Google"]),
	})
	async mailboxAction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mailboxActionInput>,
	) {
		return this.modify.act(ctx.user.id, input);
	}

	@Query({
		output: googleConnectionStatusOutput,
		meta: restMeta("GET", "/google/status", ["Google"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		output: purgeSyncedDataOutput,
		meta: restMeta("POST", "/google/purge-synced-data", ["Google"]),
	})
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation({
		output: revokeAccessOutput,
		meta: restMeta("POST", "/google/revoke", ["Google"]),
	})
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation({
		output: googleConnectionStatusOutput,
		meta: restMeta("POST", "/google/sync", ["Google"]),
	})
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: reindexCalendarInput,
		output: reindexCalendarOutput,
		meta: restMeta("POST", "/google/calendar/reindex", ["Google"]),
	})
	async reindexCalendar(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof reindexCalendarInput>,
	) {
		return this.connection.reindexCalendar(ctx.user.id, input);
	}

	@Query({
		output: historicalImportJobOutput.nullable(),
		meta: restMeta("GET", "/google/historical-import/latest", ["Google"]),
	})
	async historicalImport(@Ctx() ctx: AuthedTrpcContext) {
		return this.historicalImportsService.latest(ctx.user.id);
	}

	@Query({
		output: historicalImportJobOutput.array(),
		meta: restMeta("GET", "/google/historical-import/jobs", ["Google"]),
	})
	async historicalImports(@Ctx() ctx: AuthedTrpcContext) {
		return this.historicalImportsService.list(ctx.user.id);
	}

	@Mutation({
		input: createHistoricalImportInput,
		output: historicalImportJobOutput,
		meta: restMeta("POST", "/google/historical-import/jobs", ["Google"]),
	})
	async createHistoricalImport(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createHistoricalImportInput>,
	) {
		return this.historicalImportsService.create(ctx.user.id, input);
	}

	@Mutation({
		input: historicalImportIdInput,
		output: historicalImportJobOutput,
		meta: restMeta("POST", "/google/historical-import/jobs/{id}/pause", [
			"Google",
		]),
	})
	async pauseHistoricalImport(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		return this.historicalImportsService.pause(ctx.user.id, id);
	}

	@Mutation({
		input: historicalImportIdInput,
		output: historicalImportJobOutput,
		meta: restMeta("POST", "/google/historical-import/jobs/{id}/resume", [
			"Google",
		]),
	})
	async resumeHistoricalImport(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		return this.historicalImportsService.resume(ctx.user.id, id);
	}

	@Mutation({
		input: historicalImportIdInput,
		output: historicalImportJobOutput,
		meta: restMeta("POST", "/google/historical-import/jobs/{id}/cancel", [
			"Google",
		]),
	})
	async cancelHistoricalImport(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		return this.historicalImportsService.cancel(ctx.user.id, id);
	}

	@Mutation({
		input: sendEmailInput,
		output: sendEmailOutput,
		meta: restMeta("POST", "/google/gmail/send", ["Google"]),
	})
	async sendEmail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendEmailInput>,
	) {
		return this.gmailSend.send(ctx.user.id, input);
	}

	@Mutation({
		input: setAutoCreateInput,
		output: googleConnectionStatusOutput,
		meta: restMeta("PATCH", "/google/auto-create", ["Google"]),
	})
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.source,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: suppressDomainInput,
		output: suppressDomainOutput,
		meta: restMeta("POST", "/google/suppress-domain", ["Google"]),
	})
	async suppressDomain(@Input() input: z.infer<typeof suppressDomainInput>) {
		return this.connection.suppressDomain(input.domain, {
			reason: input.reason,
			purge: input.purge,
		});
	}

	@Query({
		input: threadInput,
		output: emailThreadOutput,
		meta: restMeta("GET", "/google/threads/{threadId}", ["Google"]),
	})
	async thread(@Input("threadId") threadId: string) {
		return this.conversations.thread(threadId);
	}

	@Query({
		input: calendarEventInput,
		output: calendarEventOutput,
		meta: restMeta("GET", "/google/events/{eventId}", ["Google"]),
	})
	async event(@Input("eventId") eventId: string) {
		return this.conversations.event(eventId);
	}
}
