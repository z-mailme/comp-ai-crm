import {
	EmailDirection,
	GoogleSyncStatus,
	MailboxHistoricalImportChunkStatus,
	MailboxHistoricalImportJobStatus,
	MailboxHistoricalImportVerificationStatus,
} from "@crm/db";
import { z } from "zod";
import { GOOGLE_SYNC_SOURCES } from "./google.constants";

export const setAutoCreateInput = z.object({
	source: z.enum(GOOGLE_SYNC_SOURCES),
	enabled: z.boolean(),
});

export const reindexCalendarInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
});

export const suppressDomainInput = z.object({
	domain: z.string().trim().min(1),
	reason: z.string().trim().max(200).optional(),
	purge: z.boolean().default(true),
});

export const threadInput = z.object({
	threadId: z.string(),
});

export const gmailLabelOutput = z.object({
	id: z.string(),
	gmailLabelId: z.string(),
	name: z.string(),
	type: z.string(),
	colorBackground: z.string().nullable(),
	colorText: z.string().nullable(),
	messagesTotal: z.number().nullable(),
	messagesUnread: z.number().nullable(),
	threadsTotal: z.number().nullable(),
	threadsUnread: z.number().nullable(),
	labelListVisibility: z.string().nullable(),
	messageListVisibility: z.string().nullable(),
});

export const calendarEventInput = z.object({
	eventId: z.string(),
});

const historicalImportDateInput = z
	.string()
	.trim()
	.min(1)
	.refine((value) => !Number.isNaN(new Date(value).getTime()), {
		message: "Date values must parse as dates.",
	})
	.transform((value) => new Date(value));

export const createHistoricalImportInput = z
	.object({
		requestedAfter: historicalImportDateInput,
		requestedBefore: historicalImportDateInput,
	})
	.refine((input) => input.requestedAfter < input.requestedBefore, {
		message: "The start date must be before the end date.",
		path: ["requestedBefore"],
	});

export const historicalImportIdInput = z.object({
	id: z.string().trim().min(1),
});

export type SetAutoCreateInput = z.infer<typeof setAutoCreateInput>;
export type ReindexCalendarInput = z.infer<typeof reindexCalendarInput>;
export type SuppressDomainInput = z.infer<typeof suppressDomainInput>;
export type CreateHistoricalImportInput = z.infer<
	typeof createHistoricalImportInput
>;
export type HistoricalImportIdInput = z.infer<typeof historicalImportIdInput>;

const googleSyncStatusOutput = z.enum(
	Object.values(GoogleSyncStatus) as [GoogleSyncStatus, ...GoogleSyncStatus[]],
);

const historicalImportJobStatusOutput = z.enum(
	Object.values(MailboxHistoricalImportJobStatus) as [
		MailboxHistoricalImportJobStatus,
		...MailboxHistoricalImportJobStatus[],
	],
);

const historicalImportChunkStatusOutput = z.enum(
	Object.values(MailboxHistoricalImportChunkStatus) as [
		MailboxHistoricalImportChunkStatus,
		...MailboxHistoricalImportChunkStatus[],
	],
);

const historicalImportVerificationStatusOutput = z.enum(
	Object.values(MailboxHistoricalImportVerificationStatus) as [
		MailboxHistoricalImportVerificationStatus,
		...MailboxHistoricalImportVerificationStatus[],
	],
);

export const googleSourceStatusOutput = z.object({
	source: z.enum(GOOGLE_SYNC_SOURCES),
	connected: z.boolean(),
	status: googleSyncStatusOutput.nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	autoCreate: z.boolean(),
	businessUnitId: z.string().nullable(),
	initialBackfilledAt: z.string().nullable(),
	backfillStartedAt: z.string().nullable(),
});

export const historicalImportChunkOutput = z.object({
	id: z.string(),
	after: z.string(),
	before: z.string(),
	status: historicalImportChunkStatusOutput,
	messagesMatched: z.number().nullable(),
	messagesAlreadyStored: z.number(),
	messagesAttempted: z.number(),
	messagesWritten: z.number(),
	messagesIgnored: z.number(),
	messagesRemaining: z.number(),
	retryAfterAt: z.string().nullable(),
	attemptCount: z.number(),
	lastError: z.string().nullable(),
	failedMessageId: z.string().nullable(),
	verifiedAt: z.string().nullable(),
	verificationStatus: historicalImportVerificationStatusOutput,
});

export const historicalImportJobOutput = z.object({
	id: z.string(),
	userId: z.string(),
	source: z.literal("gmail"),
	requestedAfter: z.string(),
	requestedBefore: z.string(),
	status: historicalImportJobStatusOutput,
	totalMessages: z.number(),
	processedMessages: z.number(),
	writtenMessages: z.number(),
	alreadyStoredMessages: z.number(),
	ignoredMessages: z.number(),
	remainingMessages: z.number(),
	totalChunks: z.number(),
	completedChunks: z.number(),
	progressPercentage: z.number(),
	currentChunk: historicalImportChunkOutput.nullable(),
	retryAfterAt: z.string().nullable(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	verifiedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const googleConnectionStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	required: z.boolean(),
	hasRefreshToken: z.boolean(),
	sources: z.array(googleSourceStatusOutput),
	historicalImport: historicalImportJobOutput.nullable(),
});

export const purgeSyncedDataOutput = z.object({
	purged: z.number(),
});

export const reindexCalendarOutput = z.object({
	reindexed: z.boolean(),
	businessUnitId: z.string().nullable(),
});

export const revokeAccessOutput = z.object({
	revoked: z.boolean(),
});

export const suppressDomainOutput = z.object({
	domain: z.string(),
	purged: z.number(),
});

const emailThreadCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
});

const emailThreadContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
});

const emailThreadRecipientOutput = z.object({
	email: z.string(),
	name: z.string().nullable(),
	kind: z.string(),
});

const emailDirectionOutput = z.enum(
	Object.values(EmailDirection) as [EmailDirection, ...EmailDirection[]],
);

const emailThreadMessageOutput = z.object({
	id: z.string(),
	direction: emailDirectionOutput,
	fromEmail: z.string(),
	fromName: z.string().nullable(),
	recipients: z.array(emailThreadRecipientOutput),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	snippet: z.string().nullable(),
	sentAt: z.string(),
	gmailMessageId: z.string().nullable(),
	outlookWebLink: z.string().nullable(),
	fromImageUrl: z.string().nullable(),
	mailboxUrl: z.string().nullable(),
	mailboxName: z.string().nullable(),
});

export const emailThreadOutput = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	messageCount: z.number(),
	firstMessageAt: z.string(),
	lastMessageAt: z.string(),
	company: emailThreadCompanyOutput.nullable(),
	contact: emailThreadContactOutput.nullable(),
	messages: z.array(emailThreadMessageOutput),
});

const calendarEventCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
});

const calendarEventContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
});

const calendarAttendeeOutput = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	responseStatus: z.string().nullable(),
	isOrganizer: z.boolean(),
	contactId: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

export const calendarEventOutput = z.object({
	id: z.string(),
	title: z.string().nullable(),
	description: z.string().nullable(),
	location: z.string().nullable(),
	conferenceUrl: z.string().nullable(),
	startsAt: z.string(),
	endsAt: z.string(),
	isAllDay: z.boolean(),
	status: z.string(),
	organizerEmail: z.string().nullable(),
	company: calendarEventCompanyOutput.nullable(),
	contact: calendarEventContactOutput.nullable(),
	attendees: z.array(calendarAttendeeOutput),
});

export type GoogleSourceStatus = z.infer<typeof googleSourceStatusOutput>;
export type GoogleConnectionStatus = z.infer<
	typeof googleConnectionStatusOutput
>;
export type HistoricalImportJobOutput = z.infer<
	typeof historicalImportJobOutput
>;
export type PurgeSyncedDataOutput = z.infer<typeof purgeSyncedDataOutput>;
export type ReindexCalendarOutput = z.infer<typeof reindexCalendarOutput>;
export type RevokeAccessOutput = z.infer<typeof revokeAccessOutput>;
export type SuppressDomainOutput = z.infer<typeof suppressDomainOutput>;
export type EmailThreadOutput = z.infer<typeof emailThreadOutput>;
export type CalendarEventOutput = z.infer<typeof calendarEventOutput>;

const emailAddressList = z.array(z.string().email()).max(50);
const emailBody = z.string().trim().min(1).max(100_000);
const emailIdempotencyKey = z
	.string()
	.trim()
	.min(8)
	.max(120)
	.regex(/^[a-zA-Z0-9-]+$/);

export const sendEmailInput = z
	.object({
		mode: z.enum(["reply", "compose"]),
		conversationId: z.string().trim().min(1).optional(),
		replyAll: z.boolean().default(false),
		to: emailAddressList.default([]),
		cc: emailAddressList.default([]),
		bcc: emailAddressList.default([]),
		subject: z.string().trim().min(1).max(500).optional(),
		body: emailBody,
		idempotencyKey: emailIdempotencyKey,
	})
	.refine((input) => input.mode !== "reply" || Boolean(input.conversationId), {
		message: "A reply needs the conversation it answers.",
		path: ["conversationId"],
	})
	.refine((input) => input.mode !== "compose" || input.to.length > 0, {
		message: "A new email needs at least one recipient.",
		path: ["to"],
	})
	.refine((input) => input.mode !== "compose" || Boolean(input.subject), {
		message: "A new email needs a subject.",
		path: ["subject"],
	});

export const sendEmailOutput = z.object({
	status: z.enum([
		"sent",
		"scope-required",
		"not-connected",
		"reconnect-required",
		"failed",
	]),
	reason: z.string().nullable(),
	gmailMessageId: z.string().nullable(),
	duplicate: z.boolean(),
});

export type SendEmailInput = z.infer<typeof sendEmailInput>;
export type SendEmailOutput = z.infer<typeof sendEmailOutput>;
