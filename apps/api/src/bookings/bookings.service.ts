import { type Db, type Prisma } from "@crm/db";
import { BookingResourceType, BookingStatus } from "@crm/db/enums";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	AvailabilityInput,
	AvailabilityOutput,
} from "./bookings.contracts";

const RESOURCE_TYPES = {
	"360_PHOTO_BOOTH": BookingResourceType.PHOTO_BOOTH_360,
} as const satisfies Record<
	AvailabilityInput["resourceType"],
	BookingResourceType
>;

const CAPACITY_STATUSES = [
	BookingStatus.CONFIRMED,
	BookingStatus.HELD,
] as const;

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

@Injectable()
export class BookingsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

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
