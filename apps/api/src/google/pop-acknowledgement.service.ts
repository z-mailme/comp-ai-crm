import type { Db } from "@crm/db";
import { readPopAutoAcknowledge } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import { GmailSendService } from "./gmail-send.service";

export type PopAcknowledgementOutcome = {
	status: "sent" | "already-sent" | "skipped" | "failed";
	reason: string | null;
};

const popEventData = z
	.object({
		acknowledgementApproved: z.boolean().catch(false),
		suggestedAcknowledgement: z.string().nullable().catch(null),
	})
	.catch({ acknowledgementApproved: false, suggestedAcknowledgement: null });

@Injectable()
export class PopAcknowledgementService {
	private readonly logger = new Logger(PopAcknowledgementService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmailSend: GmailSendService,
	) {}

	async send(eventId: string): Promise<PopAcknowledgementOutcome> {
		const event = await this.db.businessEvent.findFirst({
			where: { id: eventId, type: "POP_RECEIVED" },
			select: {
				id: true,
				conversationId: true,
				data: true,
				conversation: {
					select: {
						channel: true,
						channelAccount: { select: { userId: true } },
					},
				},
			},
		});

		if (!event?.conversationId) {
			return { status: "failed", reason: "No POP_RECEIVED event found." };
		}

		const data = popEventData.parse(event.data);
		if (!data.acknowledgementApproved) {
			return {
				status: "skipped",
				reason: "The safe-auto policy did not approve this acknowledgement.",
			};
		}

		if (!(await readPopAutoAcknowledge(this.db))) {
			return {
				status: "skipped",
				reason: "Automatic POP acknowledgement is off for this workspace.",
			};
		}

		const already = await this.db.businessEvent.findFirst({
			where: {
				type: "pop.acknowledgement.sent",
				correlationId: event.id,
			},
			select: { id: true },
		});
		if (already) {
			return { status: "already-sent", reason: null };
		}

		const userId = event.conversation?.channelAccount?.userId;
		if (event.conversation?.channel !== "EMAIL" || !userId) {
			return {
				status: "skipped",
				reason: "The POP did not arrive over a synced Gmail conversation.",
			};
		}

		const body = data.suggestedAcknowledgement;
		if (!body) {
			return {
				status: "failed",
				reason: "The event carries no acknowledgement text.",
			};
		}

		const sent = await this.gmailSend.send(userId, {
			mode: "reply",
			conversationId: event.conversationId,
			replyAll: false,
			to: [],
			cc: [],
			bcc: [],
			body,
			idempotencyKey: `pop-ack-${event.id}`,
		});

		if (sent.status !== "sent") {
			return { status: "failed", reason: sent.reason };
		}

		await this.db.businessEvent.create({
			data: {
				type: "pop.acknowledgement.sent",
				source: "AGENT",
				conversationId: event.conversationId,
				occurredAt: new Date(),
				correlationId: event.id,
				data: {
					agent: "pop-bridge",
					autonomy: "SAFE_AUTO",
					decision: "send-acknowledgement",
					sourceEventId: event.id,
					idempotencyKey: `pop-ack-${event.id}`,
					paymentConfirmed: false,
					duplicate: sent.duplicate,
				},
				idempotencyKey: `pop-ack-sent:${event.id}`,
			},
		});

		this.logger.log({
			message: "POP acknowledgement sent",
			eventId: event.id,
			duplicate: sent.duplicate,
		});

		return { status: sent.duplicate ? "already-sent" : "sent", reason: null };
	}
}
