import { type Db, type Prisma } from "@crm/db";
import {
	ActivityType,
	BookingResourceType,
	BookingStatus,
	RecordSource,
} from "@crm/db/enums";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	AvailabilityInput,
	AvailabilityOutput,
	BookingByDealOutput,
	BookingOutput,
	BookingUpsertInput,
} from "./bookings.contracts";

const RESOURCE_TYPES = {
	"360_PHOTO_BOOTH": BookingResourceType.PHOTO_BOOTH_360,
} as const satisfies Record<
	| AvailabilityInput["resourceType"]
	| BookingUpsertInput["resource"]["resourceType"],
	BookingResourceType
>;

const EXTERNAL_RESOURCE_TYPES = {
	[BookingResourceType.PHOTO_BOOTH_360]: "360_PHOTO_BOOTH",
} as const satisfies Record<
	BookingResourceType,
	BookingOutput["resources"][number]["resourceType"]
>;

const CAPACITY_STATUSES = [
	BookingStatus.CONFIRMED,
	BookingStatus.HELD,
] as const;

const BOOKING_SELECT = {
	id: true,
	dealId: true,
	bookingKey: true,
	status: true,
	eventDate: true,
	requestedStartAt: true,
	requestedEndAt: true,
	confirmedStartAt: true,
	confirmedEndAt: true,
	operationalStartAt: true,
	operationalEndAt: true,
	googleCalendarEventId: true,
	calendarStatus: true,
	resources: {
		select: { resourceType: true, quantity: true },
		orderBy: { resourceType: "asc" },
	},
	emailThreads: {
		select: { id: true },
		orderBy: { lastMessageAt: "desc" },
	},
} as const satisfies Prisma.BookingSelect;

type BookingResourceRow = Prisma.BookingResourceGetPayload<{
	select: {
		quantity: true;
		booking: {
			select: {
				id: true;
				dealId: true;
				status: true;
				requestedStartAt: true;
				requestedEndAt: true;
				confirmedStartAt: true;
				confirmedEndAt: true;
				operationalStartAt: true;
				operationalEndAt: true;
				googleCalendarEventId: true;
			};
		};
	};
}>;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

type BookingTiming = Pick<
	BookingRow,
	| "requestedStartAt"
	| "requestedEndAt"
	| "confirmedStartAt"
	| "confirmedEndAt"
	| "operationalStartAt"
	| "operationalEndAt"
>;

@Injectable()
export class BookingsService {
	private readonly logger = new Logger(BookingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async availability(input: AvailabilityInput): Promise<AvailabilityOutput> {
		const eventDate = parseEventDate(input.eventDate);
		const startAt = parseDateTime(input.startAt, "startAt");
		const endAt = parseDateTime(input.endAt, "endAt");

		if (endAt <= startAt) {
			throw new BadRequestException("endAt must be after startAt.");
		}

		const resourceType = RESOURCE_TYPES[input.resourceType];

		const [capacity, resources] = await Promise.all([
			this.db.bookingResourceCapacity.findUnique({
				where: { resourceType },
				select: { totalUnits: true },
			}),
			this.db.bookingResource.findMany({
				where: {
					resourceType,
					booking: {
						eventDate,
						status: { in: [...CAPACITY_STATUSES] },
					},
				},
				select: {
					quantity: true,
					booking: {
						select: {
							id: true,
							dealId: true,
							status: true,
							requestedStartAt: true,
							requestedEndAt: true,
							confirmedStartAt: true,
							confirmedEndAt: true,
							operationalStartAt: true,
							operationalEndAt: true,
							googleCalendarEventId: true,
						},
					},
				},
			}),
		]);

		const confirmedOverlaps: AvailabilityOutput["confirmedOverlaps"] = [];
		const uncertainTimeBookings: AvailabilityOutput["uncertainTimeBookings"] =
			[];

		for (const resource of resources) {
			const start =
				resource.booking.operationalStartAt ??
				resource.booking.confirmedStartAt;
			const end =
				resource.booking.operationalEndAt ?? resource.booking.confirmedEndAt;

			if (start === null || end === null) {
				uncertainTimeBookings.push(toAvailabilityLine(resource));
				continue;
			}

			if (start < endAt && end > startAt) {
				confirmedOverlaps.push(toAvailabilityLine(resource));
			}
		}

		const totalUnits = capacity?.totalUnits ?? 0;
		const committedUnits = [
			...confirmedOverlaps,
			...uncertainTimeBookings,
		].reduce((total, booking) => total + booking.quantity, 0);
		const remainingUnits = Math.max(totalUnits - committedUnits, 0);

		return {
			resourceType: input.resourceType,
			eventDate: input.eventDate,
			startAt: input.startAt,
			endAt: input.endAt,
			totalUnits,
			committedUnits,
			remainingUnits,
			quantityRequested: input.quantityRequested,
			available: remainingUnits >= input.quantityRequested,
			confirmedOverlaps,
			uncertainTimeBookings,
			availabilityConfidence: "SAFE",
		};
	}

	async upsert(input: BookingUpsertInput): Promise<BookingOutput> {
		const result = await this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(
				tx,
				`booking:${input.dealId}:${input.bookingKey}`,
			);

			const deal = await tx.deal.findUnique({
				where: { id: input.dealId },
				select: { id: true, companyId: true, ownerId: true },
			});

			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}

			const existing = await tx.booking.findUnique({
				where: {
					dealId_bookingKey: {
						dealId: input.dealId,
						bookingKey: input.bookingKey,
					},
				},
				select: BOOKING_SELECT,
			});

			const eventDate = parseEventDate(input.eventDate);
			const timing = parseTiming(input, existing);
			const resourceType = RESOURCE_TYPES[input.resource.resourceType];
			const previousQuantity =
				existing?.resources.find((row) => row.resourceType === resourceType)
					?.quantity ?? null;
			const now = new Date();

			const data = {
				status: input.status,
				eventDate,
				requestedStartAt: timing.requestedStartAt,
				requestedEndAt: timing.requestedEndAt,
				confirmedStartAt: timing.confirmedStartAt,
				confirmedEndAt: timing.confirmedEndAt,
				operationalStartAt: timing.operationalStartAt,
				operationalEndAt: timing.operationalEndAt,
				source: RecordSource.IMPORT,
				...(Object.hasOwn(input, "googleCalendarEventId")
					? { googleCalendarEventId: input.googleCalendarEventId ?? null }
					: {}),
				...(input.calendarStatus
					? { calendarStatus: input.calendarStatus }
					: {}),
			} satisfies Prisma.BookingUncheckedUpdateInput;

			const booking = existing
				? await tx.booking.update({
						where: { id: existing.id },
						data,
						select: BOOKING_SELECT,
					})
				: await tx.booking.create({
						data: {
							...data,
							dealId: input.dealId,
							bookingKey: input.bookingKey,
						},
						select: BOOKING_SELECT,
					});

			await tx.bookingResource.upsert({
				where: {
					bookingId_resourceType: {
						bookingId: booking.id,
						resourceType,
					},
				},
				create: {
					bookingId: booking.id,
					resourceType,
					quantity: input.resource.quantity,
				},
				update: { quantity: input.resource.quantity },
			});

			if (input.emailThreadId) {
				await this.associateEmailThread(tx, {
					emailThreadId: input.emailThreadId,
					bookingId: booking.id,
					dealId: input.dealId,
				});
			}

			const updated = await tx.booking.findUniqueOrThrow({
				where: { id: booking.id },
				select: BOOKING_SELECT,
			});

			const subjects = activitySubjects({
				before: existing,
				after: updated,
				previousQuantity,
				nextQuantity: input.resource.quantity,
			});

			for (const subject of subjects) {
				await tx.activity.create({
					data: {
						type: ActivityType.NOTE,
						subject,
						occurredAt: now,
						companyId: deal.companyId,
						dealId: deal.id,
						createdById: deal.ownerId,
						meta: {
							kind: "booking.lifecycle",
							bookingId: updated.id,
							bookingKey: updated.bookingKey,
						},
					},
				});
			}

			return {
				output: toBookingOutput(updated),
				activityAt: subjects.length > 0 ? now : null,
				target: { companyId: deal.companyId, dealId: deal.id },
			};
		});

		if (result.activityAt) {
			await this.touch(
				result.target,
				result.activityAt,
				result.output.bookingId,
			);
		}

		return result.output;
	}

	async byDeal(dealId: string): Promise<BookingByDealOutput> {
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			select: { id: true },
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${dealId}.`);
		}

		const bookings = await this.db.booking.findMany({
			where: { dealId },
			orderBy: [{ eventDate: "asc" }, { bookingKey: "asc" }],
			select: BOOKING_SELECT,
		});

		return {
			dealId,
			bookings: bookings.map(toBookingOutput),
		};
	}

	private async associateEmailThread(
		tx: Prisma.TransactionClient,
		input: { emailThreadId: string; bookingId: string; dealId: string },
	): Promise<void> {
		const thread = await tx.emailThread.findUnique({
			where: { id: input.emailThreadId },
			select: { id: true, dealId: true },
		});

		if (!thread) {
			throw new NotFoundException(
				`No email thread with id ${input.emailThreadId}.`,
			);
		}

		if (thread.dealId && thread.dealId !== input.dealId) {
			throw new BadRequestException(
				"emailThreadId is already associated with another deal.",
			);
		}

		await tx.emailThread.update({
			where: { id: input.emailThreadId },
			data: { bookingId: input.bookingId, dealId: input.dealId },
		});
	}

	private async touch(
		target: { companyId: string; dealId: string },
		at: Date,
		bookingId: string,
	): Promise<void> {
		try {
			await this.stamp.touch(target, at);
		} catch (error) {
			this.logger.error(
				{
					message:
						"A booking activity was stored but its activity stamps were not moved",
					bookingId,
					...target,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}

function toAvailabilityLine(
	resource: BookingResourceRow,
): AvailabilityOutput["confirmedOverlaps"][number] {
	return {
		bookingId: resource.booking.id,
		dealId: resource.booking.dealId,
		status: resource.booking.status as "HELD" | "CONFIRMED",
		quantity: resource.quantity,
		requestedStartAt: dateIso(resource.booking.requestedStartAt),
		requestedEndAt: dateIso(resource.booking.requestedEndAt),
		confirmedStartAt: dateIso(resource.booking.confirmedStartAt),
		confirmedEndAt: dateIso(resource.booking.confirmedEndAt),
		operationalStartAt: dateIso(resource.booking.operationalStartAt),
		operationalEndAt: dateIso(resource.booking.operationalEndAt),
		googleCalendarEventId: resource.booking.googleCalendarEventId,
	};
}

function parseEventDate(value: string): Date {
	const date = new Date(`${value}T00:00:00.000Z`);

	if (
		Number.isNaN(date.getTime()) ||
		date.toISOString().slice(0, 10) !== value
	) {
		throw new BadRequestException("eventDate must be a real calendar date.");
	}

	return date;
}

function parseDateTime(value: string, field: string): Date {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`${field} must be a real date-time.`);
	}

	return date;
}

function dateIso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function parseTiming(
	input: BookingUpsertInput,
	existing: BookingRow | null,
): BookingTiming {
	const timing = {
		requestedStartAt: dateField(input, existing, "requestedStartAt"),
		requestedEndAt: dateField(input, existing, "requestedEndAt"),
		confirmedStartAt: dateField(input, existing, "confirmedStartAt"),
		confirmedEndAt: dateField(input, existing, "confirmedEndAt"),
		operationalStartAt: dateField(input, existing, "operationalStartAt"),
		operationalEndAt: dateField(input, existing, "operationalEndAt"),
	};

	validateWindow(timing.requestedStartAt, timing.requestedEndAt, "requested");
	validateWindow(timing.confirmedStartAt, timing.confirmedEndAt, "confirmed");
	validateWindow(
		timing.operationalStartAt,
		timing.operationalEndAt,
		"operational",
	);

	return timing;
}

function dateField(
	input: BookingUpsertInput,
	existing: BookingRow | null,
	field: keyof BookingTiming,
): Date | null {
	if (!Object.hasOwn(input, field)) return existing?.[field] ?? null;

	const value = input[field];
	if (value === null || value === undefined) return null;

	return parseDateTime(value, field);
}

function validateWindow(
	start: Date | null,
	end: Date | null,
	label: string,
): void {
	if ((start === null) !== (end === null)) {
		throw new BadRequestException(
			`${label}StartAt and ${label}EndAt must both be set or both be null.`,
		);
	}

	if (start && end && end <= start) {
		throw new BadRequestException(
			`${label}EndAt must be after ${label}StartAt.`,
		);
	}
}

function toBookingOutput(booking: BookingRow): BookingOutput {
	return {
		bookingId: booking.id,
		dealId: booking.dealId,
		bookingKey: booking.bookingKey,
		status: booking.status,
		eventDate: booking.eventDate.toISOString().slice(0, 10),
		requestedStartAt: dateIso(booking.requestedStartAt),
		requestedEndAt: dateIso(booking.requestedEndAt),
		confirmedStartAt: dateIso(booking.confirmedStartAt),
		confirmedEndAt: dateIso(booking.confirmedEndAt),
		operationalStartAt: dateIso(booking.operationalStartAt),
		operationalEndAt: dateIso(booking.operationalEndAt),
		resources: booking.resources.map((resource) => ({
			resourceType: EXTERNAL_RESOURCE_TYPES[resource.resourceType],
			quantity: resource.quantity,
		})),
		googleCalendarEventId: booking.googleCalendarEventId,
		calendarStatus: booking.calendarStatus,
		emailThreadIds: booking.emailThreads.map((thread) => thread.id),
	};
}

function activitySubjects(input: {
	before: BookingRow | null;
	after: BookingRow;
	previousQuantity: number | null;
	nextQuantity: number;
}): string[] {
	const subjects: string[] = [];

	if (!input.before || input.before.status !== input.after.status) {
		subjects.push(statusSubject(input.after.status));
	}

	if (input.before) {
		const beforeRequested = rangeOf(
			input.before.requestedStartAt,
			input.before.requestedEndAt,
		);
		const afterRequested = rangeOf(
			input.after.requestedStartAt,
			input.after.requestedEndAt,
		);
		const beforeConfirmed = rangeOf(
			input.before.confirmedStartAt,
			input.before.confirmedEndAt,
		);
		const afterConfirmed = rangeOf(
			input.after.confirmedStartAt,
			input.after.confirmedEndAt,
		);
		const beforeOperational = rangeOf(
			input.before.operationalStartAt,
			input.before.operationalEndAt,
		);
		const afterOperational = rangeOf(
			input.after.operationalStartAt,
			input.after.operationalEndAt,
		);

		if (beforeRequested !== afterRequested) {
			subjects.push(
				beforeRequested && afterRequested
					? `Booking requested time changed: ${beforeRequested} -> ${afterRequested}`
					: "Booking requested time changed",
			);
		}

		if (beforeConfirmed !== afterConfirmed) {
			subjects.push(
				beforeConfirmed && afterConfirmed
					? `Booking time changed: ${beforeConfirmed} -> ${afterConfirmed}`
					: afterConfirmed
						? `Booking time confirmed: ${afterConfirmed}`
						: "Booking confirmed time cleared",
			);
		}

		if (beforeOperational !== afterOperational) {
			subjects.push(
				beforeOperational && afterOperational
					? `Booking operational time changed: ${beforeOperational} -> ${afterOperational}`
					: afterOperational
						? `Booking operational time set: ${afterOperational}`
						: "Booking operational time cleared",
			);
		}
	}

	if (
		input.previousQuantity !== null &&
		input.previousQuantity !== input.nextQuantity
	) {
		subjects.push(
			`360 booth quantity changed: ${input.previousQuantity} -> ${input.nextQuantity}`,
		);
	}

	return subjects;
}

function statusSubject(status: BookingStatus): string {
	switch (status) {
		case BookingStatus.PROVISIONAL:
			return "Booking provisional";
		case BookingStatus.HELD:
			return "Booking held";
		case BookingStatus.CONFIRMED:
			return "Booking confirmed";
		case BookingStatus.COMPLETED:
			return "Booking completed";
		case BookingStatus.CANCELLED:
			return "Booking cancelled";
	}
}

function rangeOf(start: Date | null, end: Date | null): string | null {
	if (!start || !end) return null;
	return `${start.toISOString()}-${end.toISOString()}`;
}
