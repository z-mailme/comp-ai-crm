import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Headers,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	ApiBody,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { availabilityInput } from "./bookings.contracts";
import { BookingsService } from "./bookings.service";

@ApiTags("Internal — Bookings")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/bookings")
export class BookingsController {
	private readonly logger = new Logger(BookingsController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly bookings: BookingsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Post("availability")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Check deterministic booking resource availability",
	})
	@ApiBody({
		schema: {
			type: "object",
			required: [
				"resourceType",
				"eventDate",
				"startAt",
				"endAt",
				"quantityRequested",
			],
			properties: {
				resourceType: { type: "string", enum: ["360_PHOTO_BOOTH"] },
				eventDate: { type: "string", example: "2026-09-23" },
				startAt: {
					type: "string",
					example: "2026-09-23T16:00:00+02:00",
				},
				endAt: {
					type: "string",
					example: "2026-09-23T18:00:00+02:00",
				},
				quantityRequested: { type: "integer", example: 1 },
			},
		},
	})
	@ApiOkResponse({
		description: "Capacity and booking conflicts for the window.",
	})
	async availability(
		@Headers("authorization") authorization?: string,
		@Body() body?: unknown,
	) {
		this.authorize(authorization);

		const parsed = availabilityInput.safeParse(body);

		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues.map((issue) => issue.message).join(" "),
			);
		}

		return this.bookings.availability(parsed.data);
	}

	private authorize(authorization?: string): void {
		if (!this.secret) {
			this.logger.error({
				message:
					"CRON_SECRET is not set — refusing to run booking availability.",
			});
			throw new ServiceUnavailableException(
				"Booking availability is not configured.",
			);
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
