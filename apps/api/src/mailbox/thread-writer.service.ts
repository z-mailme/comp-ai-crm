import {
	ActivityType,
	type Db,
	EmailDirection,
	MailboxMatchStatus,
	type MailboxSyncModel as MailboxSync,
	type Prisma,
	Prisma as PrismaNamespace,
	RecordSource,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type { SyncSource } from "./mailbox.constants";
import { MailboxDealMatchService } from "./mailbox-deal-match.service";
import {
	MailboxMatchService,
	type MatchContext,
} from "./mailbox-match.service";
import { snippetOf } from "./message-text";
import type { Participant } from "./participants";

export type IncomingMessage = {
	rfcMessageId: string;
	rootId: string;
	subject: string | null;
	from: Participant;
	recipients: { email: string; name: string | null; kind: "to" | "cc" }[];
	body: string;
	sentAt: Date;
	gmailMessageId?: string | null;
	outlookMessageId?: string | null;
	outlookWebLink?: string | null;
	dealId?: string | null;
};

@Injectable()
export class ThreadWriterService {
	private readonly logger = new Logger(ThreadWriterService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly deals: MailboxDealMatchService,
		private readonly stamp: ActivityStampService,
	) {}

	async context(): Promise<MatchContext> {
		const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
			this.match.internalIdentity(),
			this.match.suppressedDomains(),
			this.match.suppressedEmails(),
		]);

		return {
			ourAddresses: internal.addresses,
			ourDomains: internal.domains,
			suppressedDomains,
			suppressedEmails,
		};
	}

	async store(
		row: MailboxSync,
		options: { mailbox: string; origin: SyncSource },
		parsed: IncomingMessage,
		context: MatchContext,
	): Promise<boolean> {
		const existing = await this.db.emailMessage.findUnique({
			where: { rfcMessageId: parsed.rfcMessageId },
			select: {
				threadId: true,
				thread: {
					select: {
						companyId: true,
						contactId: true,
						dealId: true,
						matchStatus: true,
						firstMessageAt: true,
						lastMessageAt: true,
						activity: { select: { id: true, dealId: true } },
					},
				},
			},
		});
		if (existing?.thread.activity?.dealId && existing.thread.dealId)
			return false;

		const repair = existing !== null;
		const participants = [parsed.from, ...parsed.recipients];
		const outbound = parsed.from.email === options.mailbox;

		const thread = existing
			? {
					id: existing.threadId,
					companyId: existing.thread.companyId,
					contactId: existing.thread.contactId,
					dealId: existing.thread.dealId,
					matchStatus: existing.thread.matchStatus,
					firstMessageAt: existing.thread.firstMessageAt,
					lastMessageAt: existing.thread.lastMessageAt,
				}
			: await this.db.emailThread.findUnique({
					where: { rootMessageId: parsed.rootId },
					select: {
						id: true,
						companyId: true,
						contactId: true,
						dealId: true,
						matchStatus: true,
						firstMessageAt: true,
						lastMessageAt: true,
					},
				});

		let companyId = thread?.companyId ?? null;
		let contactId = thread?.contactId ?? null;
		let dealId = thread?.dealId ?? null;

		if (!thread || !companyId || !contactId) {
			const repliedTo =
				outbound ||
				(await this.hasOutboundInThread(parsed.rootId, options.mailbox));

			const match = await this.match.resolve(
				{
					participants,
					allowCreate: row.autoCreate && repliedTo,
					source: RecordSource.EMAIL,
					ownerId: row.userId,
				},
				context,
			);

			const nextCompanyId = companyId ?? match.companyId;
			companyId = nextCompanyId;
			contactId =
				contactId ??
				(match.contactId &&
				(!nextCompanyId || match.companyId === nextCompanyId)
					? match.contactId
					: null);
		}

		const firstMessageAt =
			thread && thread.firstMessageAt < parsed.sentAt
				? thread.firstMessageAt
				: parsed.sentAt;
		const lastMessageAt =
			thread && thread.lastMessageAt > parsed.sentAt
				? thread.lastMessageAt
				: parsed.sentAt;

		const dealMatch = await this.deals.resolve({
			explicitDealId: parsed.dealId ?? null,
			existingDealId: dealId,
			companyId,
			contactId,
			firstMessageAt,
			lastMessageAt,
		});

		dealId = dealMatch.dealId;
		companyId = companyId ?? dealMatch.companyId;

		const matchStatus = matchStatusFor({ companyId, contactId, dealId });

		let occurredAt: Date;

		try {
			occurredAt = await this.db.$transaction(async (tx) => {
				const record = existing
					? { id: existing.threadId }
					: await tx.emailThread.upsert({
							where: { rootMessageId: parsed.rootId },
							create: {
								rootMessageId: parsed.rootId,
								subject: parsed.subject,
								matchStatus,
								companyId,
								contactId,
								dealId,
								firstMessageAt: parsed.sentAt,
								lastMessageAt: parsed.sentAt,
								messageCount: 0,
							},
							update: {},
							select: { id: true },
						});

				if (!repair) {
					await tx.emailMessage.create({
						data: {
							threadId: record.id,
							rfcMessageId: parsed.rfcMessageId,
							syncedByUserId: row.userId,
							gmailMessageId: parsed.gmailMessageId ?? null,
							outlookMessageId: parsed.outlookMessageId ?? null,
							outlookWebLink: parsed.outlookWebLink ?? null,
							direction: outbound
								? EmailDirection.OUTBOUND
								: EmailDirection.INBOUND,
							fromEmail: parsed.from.email,
							fromName: parsed.from.name,
							recipients: parsed.recipients,
							subject: parsed.subject,
							snippet: snippetOf(parsed.body),
							body: parsed.body || null,
							sentAt: parsed.sentAt,
						},
					});
				}

				const stats = await tx.emailMessage.aggregate({
					where: { threadId: record.id },
					_count: { _all: true },
					_min: { sentAt: true },
					_max: { sentAt: true },
				});

				const firstMessageAt = stats._min.sentAt ?? parsed.sentAt;
				const lastMessageAt = stats._max.sentAt ?? parsed.sentAt;

				const data: Prisma.EmailThreadUncheckedUpdateInput = {
					messageCount: stats._count._all,
					firstMessageAt,
					lastMessageAt,
					matchStatus,
					companyId,
					contactId,
					dealId,
				};

				if (parsed.sentAt <= firstMessageAt) data.subject = parsed.subject;

				await tx.emailThread.update({ where: { id: record.id }, data });

				if (companyId || contactId || dealId) {
					return this.project(tx, record.id, row.userId, {
						subject: parsed.subject ?? "(no subject)",
						snippet: snippetOf(parsed.body),
						lastMessageAt,
						companyId,
						contactId,
						dealId,
						origin: options.origin,
					});
				}

				return lastMessageAt;
			});
		} catch (error) {
			if (await this.storedElsewhere(error, parsed.rfcMessageId)) return false;
			throw error;
		}

		if (companyId || contactId || dealId) {
			await this.touch(
				{ companyId, contactId, dealId },
				occurredAt,
				parsed.rfcMessageId,
			);
		}

		return !repair;
	}

	private async storedElsewhere(
		cause: unknown,
		rfcMessageId: string,
	): Promise<boolean> {
		const duplicate =
			cause instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			cause.code === "P2002";
		if (!duplicate) return false;

		const winner = await this.db.emailMessage.findFirst({
			where: { rfcMessageId },
			select: { id: true },
		});

		return winner !== null;
	}

	private async touch(
		target: {
			companyId: string | null;
			contactId: string | null;
			dealId: string | null;
		},
		at: Date,
		rfcMessageId: string,
	): Promise<void> {
		try {
			await this.stamp.touch(target, at);
		} catch (error) {
			this.logger.error(
				{
					message: "An email was stored but its activity stamps were not moved",
					rfcMessageId,
					...target,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async hasOutboundInThread(
		rootMessageId: string,
		mailbox: string,
	): Promise<boolean> {
		const found = await this.db.emailMessage.findFirst({
			where: {
				thread: { rootMessageId },
				fromEmail: mailbox,
			},
			select: { id: true },
		});

		return found !== null;
	}

	private async project(
		tx: Prisma.TransactionClient,
		emailThreadId: string,
		userId: string,
		summary: {
			subject: string;
			snippet: string | null;
			lastMessageAt: Date;
			companyId: string | null;
			contactId: string | null;
			dealId: string | null;
			origin: SyncSource;
		},
	): Promise<Date> {
		const activity = await tx.activity.upsert({
			where: { emailThreadId },
			create: {
				type: ActivityType.EMAIL,
				subject: summary.subject,
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				dealId: summary.dealId,
				createdById: userId,
				emailThreadId,
				meta: { synced: true, source: summary.origin },
			},
			update: {
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				dealId: summary.dealId,
			},
			select: { createdAt: true },
		});

		return activity.createdAt;
	}
}

function matchStatusFor(target: {
	companyId: string | null;
	contactId: string | null;
	dealId: string | null;
}): MailboxMatchStatus {
	if (target.dealId) return MailboxMatchStatus.MATCHED_DEAL;
	if (target.contactId) return MailboxMatchStatus.MATCHED_CONTACT;
	if (target.companyId) return MailboxMatchStatus.MATCHED_COMPANY;
	return MailboxMatchStatus.UNMATCHED;
}
