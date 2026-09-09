import { timingSafeEqual } from "node:crypto";
import {
	Body,
	Controller,
	ForbiddenException,
	Headers,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { PopAcknowledgementService } from "./pop-acknowledgement.service";

const popAcknowledgementInput = z.object({
	eventId: z.string().trim().min(1).max(100),
});

@Controller("internal/gmail")
export class PopAcknowledgementController {
	private readonly secret: string | undefined;

	constructor(
		private readonly acknowledgements: PopAcknowledgementService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("AGENT_BRIDGE_SECRET", { infer: true });
	}

	@Post("pop-acknowledgement")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async send(
		@Body() body: z.input<typeof popAcknowledgementInput>,
		@Headers("authorization") authorization?: string,
	) {
		if (!this.secret) {
			throw new ServiceUnavailableException(
				"The agent bridge is not configured.",
			);
		}

		const expected = Buffer.from(`Bearer ${this.secret}`);
		const received = Buffer.from(authorization ?? "");
		if (
			expected.length !== received.length ||
			!timingSafeEqual(expected, received)
		) {
			throw new ForbiddenException();
		}

		const parsed = popAcknowledgementInput.safeParse(body);
		if (!parsed.success) {
			return { status: "failed", reason: "The event id is missing." };
		}

		return this.acknowledgements.send(parsed.data.eventId);
	}
}
