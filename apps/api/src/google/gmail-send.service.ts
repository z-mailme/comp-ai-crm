import { GMAIL_SEND_SCOPE, GOOGLE_PROVIDER_ID } from "@crm/auth";
import { type Db, EmailDirection } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { ThreadWriterService } from "../mailbox/thread-writer.service";
import { GmailClient } from "./gmail.client";
import { planReply, type StoredReplyMessage } from "./gmail-reply-plan";
import { buildMimeMessage, encodeRawMime } from "./gmail-rfc822";
import type { SendEmailInput, SendEmailOutput } from "./google.contracts";

@Injectable()
export class GmailSendService {
	private readonly logger = new Logger(GmailSendService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
		private readonly threads: ThreadWriterService,
	) {}

	async send(userId: string, input: SendEmailInput): Promise<SendEmailOutput> {
		const scopes = await this.tokens.grantedScopes(userId, GOOGLE_PROVIDER_ID);
		if (!scopes.has(GMAIL_SEND_SCOPE)) {
			return outcome("scope-required", "Gmail send permission not granted.");
		}

		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome === "needs-reconnect") {
			return outcome("reconnect-required", token.reason);
		}
		if (token.outcome !== "ok") {
			return outcome("not-connected", token.reason);
		}

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return mapApiFailure(profile);
		}
		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox)
			return outcome("failed", "Gmail returned no mailbox address.");

		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { name: true },
		});

		const draft =
			input.mode === "reply"
				? await this.prepareReply(userId, input, mailbox)
				: prepareCompose(input, mailbox);

		if ("status" in draft) return draft;

		const sentAt = new Date();
		const messageId = messageIdFor(input.idempotencyKey, mailbox);

		const duplicate = await this.db.emailMessage.findUnique({
			where: { rfcMessageId: messageId },
			select: { gmailMessageId: true },
		});
		if (duplicate) {
			return {
				status: "sent",
				reason: null,
				gmailMessageId: duplicate.gmailMessageId,
				duplicate: true,
			};
		}

		let gmailThreadId: string | undefined;
		if (draft.anchorGmailMessageId) {
			const anchor = await this.gmail.getMessage(
				token.accessToken,
				draft.anchorGmailMessageId,
			);
			if (anchor.outcome === "ok") {
				gmailThreadId = anchor.data.threadId ?? undefined;
			}
		}

		const raw = encodeRawMime(
			buildMimeMessage({
				from: { email: mailbox, name: user?.name ?? null },
				to: draft.to,
				cc: draft.cc,
				bcc: draft.bcc,
				subject: draft.subject,
				body: input.body,
				messageId,
				inReplyTo: draft.inReplyTo,
				references: draft.references,
				sentAt,
			}),
		);

		const sent = await this.gmail.sendMessage(
			token.accessToken,
			raw,
			gmailThreadId,
		);
		if (sent.outcome !== "ok") {
			this.logger.warn({
				message: "Gmail send failed",
				userId,
				outcome: sent.outcome,
				reason: sent.reason,
			});
			return mapApiFailure(sent);
		}

		await this.persistOutbound(userId, mailbox, {
			messageId,
			rootId: draft.rootId,
			subject: draft.subject,
			body: input.body,
			to: draft.to,
			cc: draft.cc,
			sentAt,
			gmailMessageId: sent.data.id ?? null,
			fromName: user?.name ?? null,
		});

		this.logger.log({
			message: "Gmail message sent",
			userId,
			gmailMessageId: sent.data.id ?? null,
			mode: input.mode,
		});

		return {
			status: "sent",
			reason: null,
			gmailMessageId: sent.data.id ?? null,
			duplicate: false,
		};
	}

	private async prepareReply(
		userId: string,
		input: Extract<SendEmailInput, { mode: "reply" }>,
		mailbox: string,
	): Promise<PreparedDraft | SendEmailOutput> {
		const conversation = await this.db.conversation.findUnique({
			where: { id: input.conversationId },
			select: { channel: true, emailThreadId: true },
		});

		if (!conversation?.emailThreadId || conversation.channel !== "EMAIL") {
			return outcome("failed", "This conversation is not an email thread.");
		}

		const thread = await this.db.emailThread.findUnique({
			where: { id: conversation.emailThreadId },
			select: {
				rootMessageId: true,
				subject: true,
				messages: {
					where: { syncedByUserId: userId },
					orderBy: { sentAt: "asc" },
					select: {
						rfcMessageId: true,
						direction: true,
						fromEmail: true,
						fromName: true,
						recipients: true,
						sentAt: true,
						gmailMessageId: true,
					},
				},
			},
		});

		if (!thread || thread.messages.length === 0) {
			return outcome(
				"failed",
				"This conversation was not synced from your mailbox.",
			);
		}

		const messages: StoredReplyMessage[] = thread.messages.map((message) => ({
			rfcMessageId: message.rfcMessageId,
			direction:
				message.direction === EmailDirection.OUTBOUND ? "OUTBOUND" : "INBOUND",
			fromEmail: message.fromEmail,
			fromName: message.fromName,
			recipients: recipientsOf(message.recipients),
			sentAt: message.sentAt,
		}));

		const plan = planReply({
			messages,
			mailbox,
			replyAll: input.replyAll,
			extraCc: input.cc,
			extraBcc: input.bcc,
		});

		if (!plan || plan.to.length === 0) {
			return outcome(
				"failed",
				"No recipient could be resolved for this reply.",
			);
		}

		const anchorGmailId =
			thread.messages[thread.messages.length - 1]?.gmailMessageId;

		return {
			rootId: thread.rootMessageId,
			subject: replySubject(thread.subject),
			to: plan.to,
			cc: plan.cc,
			bcc: plan.bcc,
			inReplyTo: plan.inReplyTo,
			references: plan.references,
			anchorGmailMessageId: anchorGmailId ?? undefined,
		};
	}

	private async persistOutbound(
		userId: string,
		mailbox: string,
		sent: {
			messageId: string;
			rootId: string;
			subject: string;
			body: string;
			to: { email: string; name: string | null }[];
			cc: { email: string; name: string | null }[];
			sentAt: Date;
			gmailMessageId: string | null;
			fromName: string | null;
		},
	): Promise<void> {
		const row = await this.db.mailboxSync.findUnique({
			where: { userId_source: { userId, source: "gmail" } },
		});
		if (!row) return;

		try {
			const context = await this.threads.context();
			await this.threads.store(
				row,
				{ mailbox, origin: "gmail" },
				{
					rfcMessageId: sent.messageId,
					rootId: sent.rootId,
					subject: sent.subject,
					from: { email: mailbox, name: sent.fromName },
					recipients: [
						...sent.to.map((entry) => ({ ...entry, kind: "to" as const })),
						...sent.cc.map((entry) => ({ ...entry, kind: "cc" as const })),
					],
					body: sent.body,
					sentAt: sent.sentAt,
					gmailMessageId: sent.gmailMessageId,
				},
				context,
			);
		} catch (error) {
			this.logger.error(
				{
					message: "A sent Gmail message was not projected into the mailbox",
					userId,
					gmailMessageId: sent.gmailMessageId,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}

type PreparedDraft = {
	rootId: string;
	subject: string;
	to: { email: string; name: string | null }[];
	cc: { email: string; name: string | null }[];
	bcc: { email: string; name: string | null }[];
	inReplyTo: string | null;
	references: string[];
	anchorGmailMessageId?: string;
};

function prepareCompose(
	input: Extract<SendEmailInput, { mode: "compose" }>,
	mailbox: string,
): PreparedDraft {
	return {
		rootId: messageIdFor(input.idempotencyKey, mailbox),
		subject: input.subject,
		to: input.to.map((email) => ({ email, name: null })),
		cc: input.cc.map((email) => ({ email, name: null })),
		bcc: input.bcc.map((email) => ({ email, name: null })),
		inReplyTo: null,
		references: [],
	};
}

function messageIdFor(idempotencyKey: string, mailbox: string): string {
	const domain = mailbox.split("@")[1] ?? "localhost";
	return `${idempotencyKey.toLowerCase()}@${domain}`;
}

function replySubject(subject: string | null): string {
	const base = (subject ?? "").trim();
	if (/^re:/i.test(base)) return base;
	return base ? `Re: ${base}` : "Re:";
}

function recipientsOf(
	value: unknown,
): { email: string; name: string | null; kind: "to" | "cc" }[] {
	if (!Array.isArray(value)) return [];
	const out: { email: string; name: string | null; kind: "to" | "cc" }[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object") continue;
		const candidate = entry as Record<string, unknown>;
		if (typeof candidate.email !== "string" || !candidate.email) continue;
		out.push({
			email: candidate.email,
			name: typeof candidate.name === "string" ? candidate.name : null,
			kind: candidate.kind === "cc" ? "cc" : "to",
		});
	}
	return out;
}

function outcome(
	status: SendEmailOutput["status"],
	reason: string,
): SendEmailOutput {
	return { status, reason, gmailMessageId: null, duplicate: false };
}

function mapApiFailure(result: {
	outcome: string;
	reason: string;
}): SendEmailOutput {
	if (result.outcome === "unauthorized") {
		return outcome("reconnect-required", result.reason);
	}
	return outcome("failed", result.reason);
}
