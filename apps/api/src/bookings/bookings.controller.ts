import {
	BadRequestException,
	Controller,
	Get,
	Headers,
	Logger,
	Param,
	Post,
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
import {
	type AvailabilityInput,
	availabilityInput,
	type BookingUpsertInput,
	bookingUpsertInput,
} from "./bookings.contracts";
import { BookingsService } from "./bookings.service";
import { authorizeBookingInternalRequest } from "./bookings-auth";
import { zodBody } from "./zod-body";

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
		@Headers("authorization") authorization: string | undefined,
		@zodBody(availabilityInput) input: AvailabilityInput,
	) {
		this.authorize(authorization);

		return this.bookings.availability(input);
	}

	@Post("upsert")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Create or update an idempotent booking for a deal",
	})
	@ApiBody({
		schema: {
			type: "object",
			required: ["dealId", "status", "eventDate", "resource"],
			properties: {
				dealId: { type: "string" },
				bookingKey: { type: "string", example: "primary" },
				status: {
					type: "string",
					enum: ["PROVISIONAL", "HELD", "CONFIRMED", "COMPLETED", "CANCELLED"],
				},
				eventDate: { type: "string", example: "2026-09-23" },
				resource: {
					type: "object",
					required: ["resourceType", "quantity"],
					properties: {
						resourceType: { type: "string", enum: ["360_PHOTO_BOOTH"] },
						quantity: { type: "integer", example: 1 },
					},
				},
				requestedStartAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T16:00:00+02:00",
				},
				requestedEndAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T18:00:00+02:00",
				},
				confirmedStartAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T18:30:00+02:00",
				},
				confirmedEndAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T20:30:00+02:00",
				},
				operationalStartAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T18:30:00+02:00",
				},
				operationalEndAt: {
					type: "string",
					nullable: true,
					example: "2026-09-23T20:30:00+02:00",
				},
				googleCalendarEventId: { type: "string", nullable: true },
				calendarStatus: {
					type: "string",
					enum: ["NOT_ADDED", "ADDED", "FAILED"],
				},
				emailThreadId: { type: "string" },
			},
		},
	})
	@ApiOkResponse({
		description: "The canonical booking after the write.",
	})
	async upsert(
		@Headers("authorization") authorization: string | undefined,
		@zodBody(bookingUpsertInput) input: BookingUpsertInput,
	) {
		this.authorize(authorization);

		return this.bookings.upsert(input);
	}

	@Get("by-deal/:dealId")
	@AllowAnonymous()
	@ApiOperation({
		summary: "List all bookings associated with a deal",
	})
	@ApiOkResponse({
		description:
			"All bookings for the deal, ordered by event date and booking key.",
	})
	async byDeal(
		@Headers("authorization") authorization: string | undefined,
		@Param("dealId") dealId: string,
	) {
		this.authorize(authorization);

		const parsed = bookingUpsertInput.shape.dealId.safeParse(dealId);

		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues.map((issue) => issue.message).join(" "),
			);
		}

		return this.bookings.byDeal(parsed.data);
	}

	private authorize(authorization?: string): void {
		authorizeBookingInternalRequest({
			secret: this.secret,
			authorization,
			logger: this.logger,
		});
	}
}
