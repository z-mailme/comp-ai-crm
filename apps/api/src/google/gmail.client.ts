import { Injectable } from "@nestjs/common";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";
import type { GmailPart } from "./gmail-mime";
import { GMAIL_SYNC } from "./gmail-sync.config";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessage = {
	id?: string;
	threadId?: string;
	labelIds?: string[];
	snippet?: string;
	internalDate?: string;
	historyId?: string;
	payload?: GmailPart;
};

export type GmailMessageRef = {
	message?: { id?: string; threadId?: string };
	labelIds?: string[];
};

export type MessageList = {
	messages?: { id?: string; threadId?: string }[];
	nextPageToken?: string;
	resultSizeEstimate?: number;
};

export type HistoryList = {
	history?: {
		id?: string;
		messagesAdded?: GmailMessageRef[];
		messagesDeleted?: GmailMessageRef[];
		labelsAdded?: GmailMessageRef[];
		labelsRemoved?: GmailMessageRef[];
	}[];
	nextPageToken?: string;
	historyId?: string;
};

export type GmailLabel = {
	id?: string;
	name?: string;
	type?: string;
	color?: { backgroundColor?: string; textColor?: string };
	messagesTotal?: number;
	messagesUnread?: number;
	threadsTotal?: number;
	threadsUnread?: number;
	labelListVisibility?: string;
	messageListVisibility?: string;
};

export type LabelList = {
	labels?: GmailLabel[];
};

export type Profile = {
	emailAddress?: string;
	historyId?: string;
};

export const WORK_MAIL_QUERY =
	"-in:chats -category:promotions -category:social -category:forums";

@Injectable()
export class GmailClient {
	constructor(private readonly api: MailboxApiClient) {}

	async profile(accessToken: string): Promise<MailboxResult<Profile>> {
		return this.api.get<Profile>(`${BASE}/profile`, accessToken);
	}

	async listMessages(
		accessToken: string,
		options: {
			after: Date;
			before: Date;
			query?: string;
			pageToken?: string;
			maxResults?: number;
			mirror?: boolean;
			includeSpamTrash?: boolean;
		},
	): Promise<MailboxResult<MessageList>> {
		const after = Math.floor(options.after.getTime() / 1000);
		const before = Math.ceil(options.before.getTime() / 1000);
		const query = [
			options.mirror ? undefined : WORK_MAIL_QUERY,
			options.query?.trim(),
			`after:${after}`,
			`before:${before}`,
		]
			.filter((value): value is string => Boolean(value))
			.join(" ");

		return this.api.get<MessageList>(`${BASE}/messages`, accessToken, {
			q: query,
			maxResults: options.maxResults ?? GMAIL_SYNC.backfill.pageSize,
			pageToken: options.pageToken,
			includeSpamTrash: options.includeSpamTrash,
		});
	}

	async listHistory(
		accessToken: string,
		options: {
			startHistoryId: string;
			pageToken?: string;
			historyTypes?: string;
		},
	): Promise<MailboxResult<HistoryList>> {
		return this.api.get<HistoryList>(`${BASE}/history`, accessToken, {
			startHistoryId: options.startHistoryId,
			historyTypes: options.historyTypes ?? "messageAdded",
			maxResults: GMAIL_SYNC.incremental.historyPageSize,
			pageToken: options.pageToken,
		});
	}

	async listLabels(accessToken: string): Promise<MailboxResult<LabelList>> {
		return this.api.get<LabelList>(`${BASE}/labels`, accessToken);
	}

	async batchModify(
		accessToken: string,
		input: {
			ids: string[];
			addLabelIds?: string[];
			removeLabelIds?: string[];
		},
	): Promise<MailboxResult<Record<string, never>>> {
		return this.api.post<Record<string, never>>(
			`${BASE}/messages/batchModify`,
			accessToken,
			{
				ids: input.ids,
				addLabelIds: input.addLabelIds,
				removeLabelIds: input.removeLabelIds,
			},
		);
	}

	async getMessage(
		accessToken: string,
		id: string,
	): Promise<MailboxResult<GmailMessage>> {
		return this.api.get<GmailMessage>(`${BASE}/messages/${id}`, accessToken, {
			format: "full",
		});
	}

	async sendMessage(
		accessToken: string,
		raw: string,
		threadId?: string,
	): Promise<MailboxResult<GmailMessage>> {
		return this.api.post<GmailMessage>(`${BASE}/messages/send`, accessToken, {
			raw,
			threadId,
		});
	}
}
