import { type Db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { GmailClient, type GmailLabel } from "./gmail.client";

type GmailWireLabel = GmailLabel & { id: string; name: string; type: string };

@Injectable()
export class GmailLabelSyncService {
	private readonly logger = new Logger(GmailLabelSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
	) {}

	async listForUser(userId: string) {
		const row = await this.db.mailboxSync.findFirst({
			where: { userId, source: "gmail" },
			select: { id: true },
		});

		if (!row) return [];

		return this.db.gmailLabel.findMany({
			where: { mailboxSyncId: row.id },
			orderBy: [{ type: "desc" }, { name: "asc" }],
		});
	}

	async sync(row: MailboxSync, accessToken: string): Promise<number> {
		const result = await this.gmail.listLabels(accessToken);

		if (result.outcome !== "ok") {
			this.logger.warn({
				message: "Gmail label sync failed",
				userId: row.userId,
				outcome: result.outcome,
				reason: result.reason,
			});
			return 0;
		}

		const labels = (result.data.labels ?? []).filter(
			(label): label is GmailWireLabel =>
				Boolean(label.id && label.name && label.type),
		);

		for (const label of labels) {
			await this.db.gmailLabel.upsert({
				where: {
					mailboxSyncId_gmailLabelId: {
						mailboxSyncId: row.id,
						gmailLabelId: label.id,
					},
				},
				create: {
					mailboxSyncId: row.id,
					gmailLabelId: label.id,
					name: label.name,
					type: label.type,
					colorBackground: label.color?.backgroundColor ?? null,
					colorText: label.color?.textColor ?? null,
					messagesTotal: label.messagesTotal ?? null,
					messagesUnread: label.messagesUnread ?? null,
					threadsTotal: label.threadsTotal ?? null,
					threadsUnread: label.threadsUnread ?? null,
					labelListVisibility: label.labelListVisibility ?? null,
					messageListVisibility: label.messageListVisibility ?? null,
				},
				update: {
					name: label.name,
					type: label.type,
					colorBackground: label.color?.backgroundColor ?? null,
					colorText: label.color?.textColor ?? null,
					messagesTotal: label.messagesTotal ?? null,
					messagesUnread: label.messagesUnread ?? null,
					threadsTotal: label.threadsTotal ?? null,
					threadsUnread: label.threadsUnread ?? null,
					labelListVisibility: label.labelListVisibility ?? null,
					messageListVisibility: label.messageListVisibility ?? null,
				},
			});
		}

		await this.db.gmailLabel.deleteMany({
			where: {
				mailboxSyncId: row.id,
				gmailLabelId: { notIn: labels.map((label) => label.id) },
			},
		});

		return labels.length;
	}
}
