import { type Db, Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type { MailboxThreadsInput, MailboxView } from "./google.contracts";

const mailboxThreadRow = z.object({
	providerThreadId: z.string(),
	emailThreadId: z.string(),
	subject: z.string().nullable(),
	snippet: z.string().nullable(),
	fromName: z.string().nullable(),
	fromEmail: z.string(),
	messageCount: z.number(),
	lastMessageAt: z.date(),
	unread: z.boolean(),
	starred: z.boolean(),
	important: z.boolean(),
});

const VIEW_LABELS = {
	inbox: "INBOX",
	starred: "STARRED",
	sent: "SENT",
	drafts: "DRAFT",
	important: "IMPORTANT",
	spam: "SPAM",
	trash: "TRASH",
} as const;

const SYSTEM_LABEL_IDS = new Set([
	"INBOX",
	"SENT",
	"DRAFT",
	"STARRED",
	"IMPORTANT",
	"SPAM",
	"TRASH",
	"UNREAD",
	"CATEGORY_PERSONAL",
	"CATEGORY_SOCIAL",
	"CATEGORY_PROMOTIONS",
	"CATEGORY_UPDATES",
	"CATEGORY_FORUMS",
]);

type MailboxCursor = {
	lastMessageAt: Date;
	providerThreadId: string;
};

@Injectable()
export class MailboxListService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async threads(userId: string, input: MailboxThreadsInput) {
		const cursor = parseCursor(input.cursor);
		const viewLabel = input.labelId ?? viewLabelFor(input.view);
		const conditions: Prisma.Sql[] = [
			Prisma.sql`m."syncedByUserId" = ${userId}`,
			Prisma.sql`m."gmailThreadId" IS NOT NULL`,
		];

		if (viewLabel) {
			conditions.push(Prisma.sql`m."labelIds" @> ARRAY[${viewLabel}]::text[]`);
		} else {
			conditions.push(
				Prisma.sql`NOT (m."labelIds" @> ARRAY['SPAM']::text[])`,
				Prisma.sql`NOT (m."labelIds" @> ARRAY['TRASH']::text[])`,
			);
		}

		if (input.q) {
			const pattern = `%${input.q}%`;
			conditions.push(
				Prisma.sql`(m.subject ILIKE ${pattern} OR m.snippet ILIKE ${pattern} OR m."fromEmail" ILIKE ${pattern} OR m."fromName" ILIKE ${pattern})`,
			);
		}

		const having: Prisma.Sql[] = [];
		if (input.unreadOnly) {
			having.push(Prisma.sql`BOOL_OR(m."labelIds" @> ARRAY['UNREAD']::text[])`);
		}
		if (input.starredOnly) {
			having.push(
				Prisma.sql`BOOL_OR(m."labelIds" @> ARRAY['STARRED']::text[])`,
			);
		}
		if (cursor) {
			having.push(
				Prisma.sql`(MAX(m."sentAt"), m."gmailThreadId") < (${cursor.lastMessageAt}, ${cursor.providerThreadId})`,
			);
		}

		const whereSql = Prisma.join(conditions, " AND ");
		const havingSql =
			having.length > 0
				? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}`
				: Prisma.empty;

		const raw = await this.db.$queryRaw<unknown>(
			Prisma.sql`
				SELECT
					m."gmailThreadId" AS "providerThreadId",
					(ARRAY_AGG(m."threadId" ORDER BY m."sentAt" DESC))[1] AS "emailThreadId",
					(ARRAY_AGG(m.subject ORDER BY m."sentAt" DESC))[1] AS subject,
					(ARRAY_AGG(m.snippet ORDER BY m."sentAt" DESC))[1] AS snippet,
					(ARRAY_AGG(m."fromName" ORDER BY m."sentAt" DESC))[1] AS "fromName",
					(ARRAY_AGG(m."fromEmail" ORDER BY m."sentAt" DESC))[1] AS "fromEmail",
					COUNT(*)::int AS "messageCount",
					MAX(m."sentAt") AS "lastMessageAt",
					BOOL_OR(m."labelIds" @> ARRAY['UNREAD']::text[]) AS unread,
					BOOL_OR(m."labelIds" @> ARRAY['STARRED']::text[]) AS starred,
					BOOL_OR(m."labelIds" @> ARRAY['IMPORTANT']::text[]) AS important
				FROM "emailMessage" m
				WHERE ${whereSql}
				GROUP BY m."gmailThreadId"
				${havingSql}
				ORDER BY "lastMessageAt" DESC, m."gmailThreadId" DESC
				LIMIT ${input.limit + 1}
			`,
		);

		const rows = z.array(mailboxThreadRow).parse(raw);
		const page = rows.slice(0, input.limit);
		const last = page.at(-1);
		const nextCursor =
			rows.length > input.limit && last
				? formatCursor({
						lastMessageAt: last.lastMessageAt,
						providerThreadId: last.providerThreadId,
					})
				: null;

		const [labelRows, emailThreads] = await Promise.all([
			this.db.emailMessage.findMany({
				where: {
					syncedByUserId: userId,
					gmailThreadId: {
						in: page.map((row) => row.providerThreadId),
					},
				},
				select: { gmailThreadId: true, labelIds: true },
			}),
			this.db.emailThread.findMany({
				where: { id: { in: page.map((row) => row.emailThreadId) } },
				select: {
					id: true,
					matchStatus: true,
					contact: { select: { firstName: true, lastName: true } },
					company: { select: { name: true } },
					deal: { select: { name: true } },
				},
			}),
		]);

		const labelsByThread = new Map<string, Set<string>>();
		for (const message of labelRows) {
			if (!message.gmailThreadId) continue;
			const set =
				labelsByThread.get(message.gmailThreadId) ?? new Set<string>();
			for (const labelId of message.labelIds) set.add(labelId);
			labelsByThread.set(message.gmailThreadId, set);
		}

		const threadById = new Map(
			emailThreads.map((thread) => [thread.id, thread]),
		);

		return {
			rows: page.map((row) => {
				const thread = threadById.get(row.emailThreadId);
				const userLabelIds = [
					...(labelsByThread.get(row.providerThreadId) ?? []),
				]
					.filter((labelId) => !SYSTEM_LABEL_IDS.has(labelId))
					.sort();

				return {
					providerThreadId: row.providerThreadId,
					emailThreadId: row.emailThreadId,
					subject: row.subject,
					snippet: row.snippet,
					fromName: row.fromName,
					fromEmail: row.fromEmail,
					messageCount: row.messageCount,
					lastMessageAt: row.lastMessageAt.toISOString(),
					unread: row.unread,
					starred: row.starred,
					important: row.important,
					userLabelIds,
					match: thread
						? {
								status: thread.matchStatus,
								contactName: thread.contact
									? [thread.contact.firstName, thread.contact.lastName]
											.filter(Boolean)
											.join(" ")
									: null,
								companyName: thread.company?.name ?? null,
								dealName: thread.deal?.name ?? null,
							}
						: null,
				};
			}),
			nextCursor,
		};
	}
}

function viewLabelFor(view: MailboxView): string | null {
	return view === "all" ? null : VIEW_LABELS[view];
}

function parseCursor(value: string | undefined): MailboxCursor | null {
	if (!value) return null;

	const separator = value.indexOf(":");
	if (separator <= 0) return null;

	const at = new Date(Number(value.slice(0, separator)));
	const providerThreadId = value.slice(separator + 1);
	if (Number.isNaN(at.getTime()) || !providerThreadId) return null;

	return { lastMessageAt: at, providerThreadId };
}

function formatCursor(cursor: MailboxCursor): string {
	return `${cursor.lastMessageAt.getTime()}:${cursor.providerThreadId}`;
}
