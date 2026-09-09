import {
	BusinessEventSource,
	CommunicationChannel,
	CommunicationDirection,
	type Db,
	type Prisma,
} from "@crm/db";
import type {
	WhatsappWebhookMessage,
	WhatsappWebhookPayload,
	WhatsappWebhookStatus,
} from "@crm/validation/whatsapp";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";

export type IngressOutcome = {
	messages: number;
	statuses: number;
	events: number;
};

@Injectable()
export class WhatsappService {
	private readonly logger = new Logger(WhatsappService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async ingest(payload: WhatsappWebhookPayload): Promise<IngressOutcome> {
		let messages = 0;
		let statuses = 0;
		let events = 0;

		for (const entry of payload.entry) {
			for (const change of entry.changes) {
				const phoneNumberId = change.value.metadata?.phone_number_id ?? null;

				for (const message of change.value.messages ?? []) {
					const profileName =
						change.value.contacts?.find(
							(contact) => contact.wa_id === message.from,
						)?.profile?.name ?? null;

					const created = await this.persistMessage(
						message,
						profileName,
						phoneNumberId,
					);
					messages += 1;
					if (created) events += 1;
				}

				for (const status of change.value.statuses ?? []) {
					await this.applyStatus(status);
					statuses += 1;
				}
			}
		}

		if (messages > 0 || statuses > 0) {
			this.logger.log({
				message: "WhatsApp webhook ingested",
				messages,
				statuses,
				events,
			});
		}

		return { messages, statuses, events };
	}

	private async persistMessage(
		message: WhatsappWebhookMessage,
		profileName: string | null,
		phoneNumberId: string | null,
	): Promise<boolean> {
		const existing = await this.db.communicationMessage.findFirst({
			where: {
				channel: CommunicationChannel.WHATSAPP,
				providerMessageId: message.id,
			},
			select: { id: true },
		});
		if (existing) return false;

		const phone = normalizePhone(message.from);
		const contact = await matchContactByPhone(this.db, phone);

		const conversation = await this.db.conversation.upsert({
			where: {
				channel_externalThreadId: {
					channel: CommunicationChannel.WHATSAPP,
					externalThreadId: phone,
				},
			},
			create: {
				channel: CommunicationChannel.WHATSAPP,
				externalThreadId: phone,
				contactId: contact?.id ?? null,
				companyId: contact?.companyId ?? null,
				subject: profileName,
				firstMessageAt: timestampOf(message),
				lastMessageAt: timestampOf(message),
				unreadCount: 1,
				metadata: { phoneNumberId },
			},
			update: {
				lastMessageAt: timestampOf(message),
				contactId: contact?.id ?? null,
				companyId: contact?.companyId ?? null,
				unreadCount: { increment: 1 },
			},
		});

		const body = message.text?.body ?? mediaCaption(message);
		const stored = await this.db.communicationMessage.create({
			data: {
				conversationId: conversation.id,
				channel: CommunicationChannel.WHATSAPP,
				direction: CommunicationDirection.INBOUND,
				sender: {
					phone,
					name: profileName ?? contact?.firstName ?? null,
				} as Prisma.InputJsonValue,
				recipients: [],
				subject: null,
				body,
				snippet: body ? body.slice(0, 200) : null,
				sentAt: timestampOf(message),
				externalMessageId: message.id,
				providerMessageId: message.id,
				metadata: {
					phoneNumberId,
					type: message.type,
					replyTo: message.context?.id ?? null,
					media: mediaMeta(message),
					raw: message,
				} as Prisma.InputJsonValue,
			},
		});

		await this.db.businessEvent.upsert({
			where: {
				idempotencyKey: `communication:whatsapp:${message.id}`,
			},
			create: {
				type: "communication.received",
				source: BusinessEventSource.WHATSAPP,
				channel: CommunicationChannel.WHATSAPP,
				contactId: contact?.id ?? null,
				companyId: contact?.companyId ?? null,
				conversationId: conversation.id,
				messageId: stored.id,
				occurredAt: timestampOf(message),
				data: { phone, type: message.type },
				idempotencyKey: `communication:whatsapp:${message.id}`,
				outbox: {
					create: {
						destination: "memory-bridge",
						payload: {
							entityType: "MESSAGE",
							entityId: stored.id,
							conversationId: conversation.id,
							source: "whatsapp",
						},
					},
				},
			},
			update: {},
		});

		return true;
	}

	private async applyStatus(status: WhatsappWebhookStatus): Promise<void> {
		const messages = await this.db.communicationMessage.findMany({
			where: {
				channel: CommunicationChannel.WHATSAPP,
				providerMessageId: status.id,
			},
			select: { id: true, metadata: true },
		});

		for (const message of messages) {
			const current = messageMetadata.parse(message.metadata ?? {});

			await this.db.communicationMessage.update({
				where: { id: message.id },
				data: {
					metadata: {
						...current,
						deliveryStatus: status.status,
						statusAt: timestampFromUnix(status.timestamp).toISOString(),
					} as Prisma.InputJsonValue,
				},
			});
		}
	}
}

const messageMetadata = z
	.object({
		phoneNumberId: z.string().nullish(),
		type: z.string().nullish(),
		replyTo: z.string().nullish(),
		media: z
			.object({
				id: z.string(),
				mimeType: z.string().nullish(),
				filename: z.string().nullish(),
			})
			.nullish(),
		raw: z.unknown().optional(),
	})
	.passthrough();

function normalizePhone(value: string): string {
	return value.replace(/[^\d]/g, "");
}

function timestampOf(message: WhatsappWebhookMessage): Date {
	return timestampFromUnix(message.timestamp);
}

function timestampFromUnix(value: string): Date {
	const ms = Number(value) * 1000;
	return Number.isFinite(ms) ? new Date(ms) : new Date();
}

function mediaCaption(message: WhatsappWebhookMessage): string | null {
	return (
		message.image?.caption ??
		message.document?.caption ??
		message.video?.caption ??
		null
	);
}

function mediaMeta(
	message: WhatsappWebhookMessage,
): Record<string, string | null> | null {
	if (message.document) {
		return {
			id: message.document.id,
			mimeType: message.document.mime_type ?? null,
			filename: message.document.filename ?? null,
		};
	}

	const media = message.image ?? message.audio ?? message.video;
	if (!media) return null;

	return {
		id: media.id,
		mimeType: media.mime_type ?? null,
		filename: null,
	};
}

export async function matchContactByPhone(
	db: Db,
	phone: string,
): Promise<{
	id: string;
	companyId: string | null;
	firstName: string | null;
} | null> {
	if (phone.length < 7) return null;

	const tail = phone.slice(-9);

	const candidates = await db.contact.findMany({
		where: { phone: { not: null }, archivedAt: null },
		select: { id: true, companyId: true, firstName: true, phone: true },
	});

	const normalized = candidates.filter(
		(candidate) => normalizePhone(candidate.phone ?? "").length >= 9,
	);

	return (
		normalized.find(
			(candidate) => normalizePhone(candidate.phone ?? "") === phone,
		) ??
		normalized.find((candidate) =>
			normalizePhone(candidate.phone ?? "").endsWith(tail),
		) ??
		normalized.find((candidate) =>
			tail.endsWith(normalizePhone(candidate.phone ?? "")),
		) ??
		null
	);
}
