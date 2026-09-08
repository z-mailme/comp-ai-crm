import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	Post,
	Query,
	Res,
	ServiceUnavailableException,
} from "@nestjs/common";
import type { Response } from "express";
import { whatsappWebhookPayload } from "@crm/validation/whatsapp";
import { WhatsappService } from "./whatsapp.service";

@Controller("webhooks/whatsapp")
export class WhatsappController {
	constructor(private readonly whatsapp: WhatsappService) {}

	@Get()
	verify(
		@Query("hub.mode") mode: string | undefined,
		@Query("hub.verify_token") token: string | undefined,
		@Query("hub.challenge") challenge: string | undefined,
		@Res() response: Response,
	) {
		const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

		if (!expected) {
			throw new ServiceUnavailableException(
				"WhatsApp is not configured on this install.",
			);
		}

		if (mode !== "subscribe" || token !== expected || !challenge) {
			throw new ForbiddenException("Webhook verification failed.");
		}

		response.type("text/plain").send(challenge);
	}

	@Post()
	@HttpCode(200)
	async ingest(@Body() body: unknown) {
		if (!process.env.WHATSAPP_VERIFY_TOKEN?.trim()) {
			throw new ServiceUnavailableException(
				"WhatsApp is not configured on this install.",
			);
		}

		const parsed = whatsappWebhookPayload.safeParse(body);
		if (!parsed.success) {
			throw new BadRequestException("Unrecognised WhatsApp webhook payload.");
		}

		return this.whatsapp.ingest(parsed.data);
	}
}
