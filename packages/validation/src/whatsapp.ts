import { z } from "zod";

export const whatsappWebhookMessage = z.object({
	from: z.string(),
	id: z.string(),
	timestamp: z.string(),
	type: z.string(),
	text: z.object({ body: z.string() }).optional(),
	image: z
		.object({
			id: z.string(),
			mime_type: z.string().optional(),
			caption: z.string().optional(),
		})
		.optional(),
	document: z
		.object({
			id: z.string(),
			mime_type: z.string().optional(),
			filename: z.string().optional(),
			caption: z.string().optional(),
		})
		.optional(),
	audio: z
		.object({ id: z.string(), mime_type: z.string().optional() })
		.optional(),
	video: z
		.object({
			id: z.string(),
			mime_type: z.string().optional(),
			caption: z.string().optional(),
		})
		.optional(),
	context: z.object({ id: z.string() }).optional(),
});

export type WhatsappWebhookMessage = z.infer<typeof whatsappWebhookMessage>;

export const whatsappWebhookStatus = z.object({
	id: z.string(),
	status: z.enum(["sent", "delivered", "read", "failed"]),
	timestamp: z.string(),
	recipient_id: z.string(),
});

export type WhatsappWebhookStatus = z.infer<typeof whatsappWebhookStatus>;

export const whatsappWebhookContact = z.object({
	profile: z.object({ name: z.string() }).optional(),
	wa_id: z.string(),
});

export const whatsappWebhookValue = z.object({
	messaging_product: z.string().optional(),
	metadata: z
		.object({
			display_phone_number: z.string().optional(),
			phone_number_id: z.string().optional(),
		})
		.optional(),
	contacts: z.array(whatsappWebhookContact).optional(),
	messages: z.array(whatsappWebhookMessage).optional(),
	statuses: z.array(whatsappWebhookStatus).optional(),
});

export const whatsappWebhookPayload = z.object({
	object: z.string().optional(),
	entry: z
		.array(
			z.object({
				id: z.string(),
				changes: z
					.array(
						z.object({
							field: z.string(),
							value: whatsappWebhookValue,
						}),
					)
					.default([]),
			}),
		)
		.default([]),
});

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookPayload>;
