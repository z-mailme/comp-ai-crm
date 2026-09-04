import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import {
	ActivityType,
	BookingResourceType,
	BookingStatus,
	CalendarStatus,
	RecordSource,
} from "@crm/db/enums";
import {
	ForbiddenException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { BookingsService } from "../src/bookings/bookings.service";
import { authorizeBookingInternalRequest } from "../src/bookings/bookings-auth";

const dealId = "deal-123";
const companyId = "company-123";
const ownerId = "user-123";
const eventDate = "2026-09-23";
const requestedStartAt = "2026-09-23T16:00:00+02:00";
const requestedEndAt = "2026-09-23T18:00:00+02:00";
const confirmedStartAt = "2026-09-23T18:30:00+02:00";
const confirmedEndAt = "2026-09-23T20:30:00+02:00";
const operationalStartAt = "2026-09-23T19:00:00+02:00";
const operationalEndAt = "2026-09-23T21:00:00+02:00";

describe("booking lifecycle", () => {
	it("creates a provisional booking", async () => {
		const store = storeWithDeal();
		const result = await service(store).upsert(baseInput());

		expect(result.status).toBe("PROVISIONAL");
		expect(result.bookingKey).toBe("primary");
		expect(result.resources).toEqual([
			{ resourceType: "360_PHOTO_BOOTH", quantity: 1 },
		]);
		expect(store.bookings).toHaveLength(1);
	});

	it("does not duplicate a booking when the same upsert retries", async () => {
		const store = storeWithDeal();
		const first = await service(store).upsert(baseInput());
		const second = await service(store).upsert(baseInput());

		expect(second.bookingId).toBe(first.bookingId);
		expect(store.bookings).toHaveLength(1);
		expect(store.activities).toHaveLength(1);
	});

	it("converts a provisional booking to confirmed", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert(baseInput());
		const result = await bookings.upsert({
			...baseInput(),
			status: "CONFIRMED",
		});

		expect(result.status).toBe("CONFIRMED");
		expect(store.activities.map((row) => row.subject)).toContain(
			"Booking confirmed",
		);
	});

	it("counts a confirmed booking in availability", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert({
			...baseInput(),
			status: "CONFIRMED",
			confirmedStartAt: requestedStartAt,
			confirmedEndAt: requestedEndAt,
		});
		const result = await availability(bookings);

		expect(result.committedUnits).toBe(1);
		expect(result.remainingUnits).toBe(4);
	});

	it("releases capacity when a booking is cancelled", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert({
			...baseInput(),
			status: "CONFIRMED",
			confirmedStartAt: requestedStartAt,
			confirmedEndAt: requestedEndAt,
		});
		await bookings.upsert({ ...baseInput(), status: "CANCELLED" });
		const result = await availability(bookings);

		expect(result.committedUnits).toBe(0);
		expect(result.remainingUnits).toBe(5);
	});

	it("uses quantity two as two committed booth units", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert({
			...baseInput(),
			status: "CONFIRMED",
			resource: { resourceType: "360_PHOTO_BOOTH", quantity: 2 },
			confirmedStartAt: requestedStartAt,
			confirmedEndAt: requestedEndAt,
		});
		const result = await availability(bookings);

		expect(result.committedUnits).toBe(2);
		expect(result.remainingUnits).toBe(3);
	});

	it("updates confirmed time without overwriting requested time", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert({
			...baseInput(),
			requestedStartAt,
			requestedEndAt,
		});
		const result = await bookings.upsert({
			...baseInput(),
			status: "CONFIRMED",
			confirmedStartAt,
			confirmedEndAt,
		});

		expect(result.requestedStartAt).toBe("2026-09-23T14:00:00.000Z");
		expect(result.requestedEndAt).toBe("2026-09-23T16:00:00.000Z");
		expect(result.confirmedStartAt).toBe("2026-09-23T16:30:00.000Z");
		expect(result.confirmedEndAt).toBe("2026-09-23T18:30:00.000Z");
	});

	it("allows operational time to differ from confirmed time", async () => {
		const store = storeWithDeal();
		const result = await service(store).upsert({
			...baseInput(),
			status: "CONFIRMED",
			confirmedStartAt,
			confirmedEndAt,
			operationalStartAt,
			operationalEndAt,
		});

		expect(result.confirmedStartAt).toBe("2026-09-23T16:30:00.000Z");
		expect(result.operationalStartAt).toBe("2026-09-23T17:00:00.000Z");
	});

	it("counts confirmed bookings with unknown time on the same date", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert({ ...baseInput(), status: "CONFIRMED" });
		const result = await availability(bookings);

		expect(result.committedUnits).toBe(1);
		expect(result.uncertainTimeBookings).toHaveLength(1);
	});

	it("returns the bookings for a deal", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		const created = await bookings.upsert(baseInput());
		const result = await bookings.byDeal(dealId);

		expect(result).toEqual({ dealId, bookings: [created] });
	});

	it("returns multiple bookings explicitly for a deal", async () => {
		const store = storeWithDeal();
		const bookings = service(store);

		await bookings.upsert(baseInput());
		await bookings.upsert({ ...baseInput(), bookingKey: "evening" });
		const result = await bookings.byDeal(dealId);

		expect(result.bookings.map((booking) => booking.bookingKey)).toEqual([
			"evening",
			"primary",
		]);
		expect(result.bookings).toHaveLength(2);
	});

	it("fails safely when the deal does not exist", async () => {
		const store = new BookingStore();

		await expect(service(store).upsert(baseInput())).rejects.toThrow(
			"No deal with id deal-123.",
		);
	});

	it("associates an email thread only when emailThreadId is explicit", async () => {
		const store = storeWithDeal();
		store.emailThreads.push({
			id: "thread-123",
			dealId: null,
			bookingId: null,
			lastMessageAt: new Date("2026-09-20T10:00:00.000Z"),
		});
		const bookings = service(store);

		const created = await bookings.upsert(baseInput());
		expect(store.emailThreads[0]?.bookingId).toBeNull();

		await bookings.upsert({
			...baseInput(),
			emailThreadId: "thread-123",
		});

		expect(store.emailThreads[0]?.bookingId).toBe(created.bookingId);
		expect(store.emailThreads[0]?.dealId).toBe(dealId);
	});

	it("checks CRON_SECRET authentication on internal routes", async () => {
		expect(() =>
			authorizeBookingInternalRequest({
				secret: "test-secret-1234",
				authorization: "Bearer wrong",
				logger: silentLogger,
			}),
		).toThrow(ForbiddenException);
		expect(() =>
			authorizeBookingInternalRequest({
				secret: "test-secret-1234",
				authorization: "Bearer test-secret-1234",
				logger: silentLogger,
			}),
		).not.toThrow();
		expect(() =>
			authorizeBookingInternalRequest({
				secret: undefined,
				authorization: "Bearer test-secret-1234",
				logger: silentLogger,
			}),
		).toThrow(ServiceUnavailableException);
	});
});

function baseInput() {
	return {
		dealId,
		bookingKey: "primary",
		status: "PROVISIONAL" as const,
		eventDate,
		resource: { resourceType: "360_PHOTO_BOOTH" as const, quantity: 1 },
	};
}

async function availability(bookings: BookingsService) {
	return bookings.availability({
		resourceType: "360_PHOTO_BOOTH",
		eventDate,
		startAt: requestedStartAt,
		endAt: requestedEndAt,
		quantityRequested: 1,
	});
}

function service(store: BookingStore): BookingsService {
	return new BookingsService(
		store as unknown as Db,
		{
			touch: async () => undefined,
		} as never,
	);
}

function storeWithDeal(): BookingStore {
	const store = new BookingStore();
	store.deals.push({ id: dealId, companyId, ownerId });
	return store;
}

type DealRow = {
	id: string;
	companyId: string;
	ownerId: string;
};

const silentLogger = {
	error: () => undefined,
};

type BookingRow = {
	id: string;
	dealId: string;
	bookingKey: string;
	status: BookingStatus;
	eventDate: Date;
	requestedStartAt: Date | null;
	requestedEndAt: Date | null;
	confirmedStartAt: Date | null;
	confirmedEndAt: Date | null;
	operationalStartAt: Date | null;
	operationalEndAt: Date | null;
	googleCalendarEventId: string | null;
	calendarStatus: CalendarStatus;
	source: RecordSource;
	createdAt: Date;
	updatedAt: Date;
};

type ResourceRow = {
	bookingId: string;
	resourceType: BookingResourceType;
	quantity: number;
};

type EmailThreadRow = {
	id: string;
	dealId: string | null;
	bookingId: string | null;
	lastMessageAt: Date;
};

type ActivityRow = {
	type: ActivityType;
	subject: string | null;
	occurredAt: Date | null;
	companyId: string | null;
	dealId: string | null;
	createdById: string;
	meta: unknown;
};

class BookingStore {
	deals: DealRow[] = [];
	bookings: BookingRow[] = [];
	resources: ResourceRow[] = [];
	emailThreads: EmailThreadRow[] = [];
	activities: ActivityRow[] = [];
	private nextBooking = 1;

	$queryRaw = async () => [];

	$transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> =>
		fn(this);

	deal = {
		findUnique: async (args: { where: { id: string } }) =>
			this.deals.find((deal) => deal.id === args.where.id) ?? null,
	};

	booking = {
		findUnique: async (args: { where: BookingWhere }) =>
			this.findBooking(args.where),
		findUniqueOrThrow: async (args: { where: { id: string } }) => {
			const booking = this.findBooking(args.where);
			if (!booking) throw new Error("Booking not found.");
			return booking;
		},
		findMany: async (args: { where: { dealId: string } }) =>
			this.bookings
				.filter((booking) => booking.dealId === args.where.dealId)
				.sort((left, right) => {
					const date = left.eventDate.getTime() - right.eventDate.getTime();
					if (date !== 0) return date;
					return left.bookingKey.localeCompare(right.bookingKey);
				})
				.map((booking) => this.bookingView(booking)),
		create: async (args: { data: BookingCreateData }) => {
			const now = new Date();
			const booking: BookingRow = {
				id: `booking-${this.nextBooking}`,
				dealId: args.data.dealId,
				bookingKey: args.data.bookingKey,
				status: args.data.status,
				eventDate: args.data.eventDate,
				requestedStartAt: args.data.requestedStartAt ?? null,
				requestedEndAt: args.data.requestedEndAt ?? null,
				confirmedStartAt: args.data.confirmedStartAt ?? null,
				confirmedEndAt: args.data.confirmedEndAt ?? null,
				operationalStartAt: args.data.operationalStartAt ?? null,
				operationalEndAt: args.data.operationalEndAt ?? null,
				googleCalendarEventId: args.data.googleCalendarEventId ?? null,
				calendarStatus: args.data.calendarStatus ?? CalendarStatus.NOT_ADDED,
				source: args.data.source,
				createdAt: now,
				updatedAt: now,
			};
			this.nextBooking += 1;
			this.bookings.push(booking);
			return this.bookingView(booking);
		},
		update: async (args: {
			where: { id: string };
			data: BookingUpdateData;
		}) => {
			const booking = this.bookings.find((row) => row.id === args.where.id);
			if (!booking) throw new Error("Booking not found.");
			Object.assign(booking, args.data, { updatedAt: new Date() });
			return this.bookingView(booking);
		},
	};

	bookingResource = {
		findMany: async (args: {
			where: {
				resourceType: BookingResourceType;
				booking: { eventDate: Date; status: { in: BookingStatus[] } };
			};
		}) =>
			this.resources
				.map((resource) => ({
					resource,
					booking: this.bookings.find(
						(booking) => booking.id === resource.bookingId,
					),
				}))
				.filter((row): row is { resource: ResourceRow; booking: BookingRow } =>
					Boolean(row.booking),
				)
				.filter(
					({ resource, booking }) =>
						resource.resourceType === args.where.resourceType &&
						booking.eventDate.getTime() ===
							args.where.booking.eventDate.getTime() &&
						args.where.booking.status.in.includes(booking.status),
				)
				.map(({ resource, booking }) => ({
					quantity: resource.quantity,
					booking: this.availabilityBookingView(booking),
				})),
		upsert: async (args: {
			where: {
				bookingId_resourceType: {
					bookingId: string;
					resourceType: BookingResourceType;
				};
			};
			create: ResourceRow;
			update: { quantity: number };
		}) => {
			const existing = this.resources.find(
				(resource) =>
					resource.bookingId === args.where.bookingId_resourceType.bookingId &&
					resource.resourceType ===
						args.where.bookingId_resourceType.resourceType,
			);
			if (existing) {
				existing.quantity = args.update.quantity;
				return existing;
			}
			this.resources.push(args.create);
			return args.create;
		},
	};

	bookingResourceCapacity = {
		findUnique: async () => ({ totalUnits: 5 }),
	};

	emailThread = {
		findUnique: async (args: { where: { id: string } }) =>
			this.emailThreads.find((thread) => thread.id === args.where.id) ?? null,
		update: async (args: {
			where: { id: string };
			data: { bookingId: string; dealId: string };
		}) => {
			const thread = this.emailThreads.find((row) => row.id === args.where.id);
			if (!thread) throw new Error("Email thread not found.");
			Object.assign(thread, args.data);
			return thread;
		},
	};

	activity = {
		create: async (args: { data: ActivityRow }) => {
			this.activities.push(args.data);
			return args.data;
		},
	};

	private findBooking(
		where: BookingWhere,
	): ReturnType<BookingStore["bookingView"]> | null {
		const booking =
			"id" in where
				? this.bookings.find((row) => row.id === where.id)
				: this.bookings.find(
						(row) =>
							row.dealId === where.dealId_bookingKey.dealId &&
							row.bookingKey === where.dealId_bookingKey.bookingKey,
					);

		return booking ? this.bookingView(booking) : null;
	}

	private bookingView(booking: BookingRow) {
		return {
			...booking,
			resources: this.resources
				.filter((resource) => resource.bookingId === booking.id)
				.map((resource) => ({
					resourceType: resource.resourceType,
					quantity: resource.quantity,
				})),
			emailThreads: this.emailThreads
				.filter((thread) => thread.bookingId === booking.id)
				.sort(
					(left, right) =>
						right.lastMessageAt.getTime() - left.lastMessageAt.getTime(),
				)
				.map((thread) => ({ id: thread.id })),
		};
	}

	private availabilityBookingView(booking: BookingRow) {
		return {
			id: booking.id,
			dealId: booking.dealId,
			status: booking.status,
			requestedStartAt: booking.requestedStartAt,
			requestedEndAt: booking.requestedEndAt,
			confirmedStartAt: booking.confirmedStartAt,
			confirmedEndAt: booking.confirmedEndAt,
			operationalStartAt: booking.operationalStartAt,
			operationalEndAt: booking.operationalEndAt,
			googleCalendarEventId: booking.googleCalendarEventId,
		};
	}
}

type BookingWhere =
	| { id: string }
	| { dealId_bookingKey: { dealId: string; bookingKey: string } };

type BookingCreateData = BookingUpdateData & {
	dealId: string;
	bookingKey: string;
	source: RecordSource;
};

type BookingUpdateData = {
	status: BookingStatus;
	eventDate: Date;
	requestedStartAt: Date | null;
	requestedEndAt: Date | null;
	confirmedStartAt: Date | null;
	confirmedEndAt: Date | null;
	operationalStartAt: Date | null;
	operationalEndAt: Date | null;
	source: RecordSource;
	googleCalendarEventId?: string | null;
	calendarStatus?: CalendarStatus;
};
