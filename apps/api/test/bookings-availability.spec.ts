import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { BookingStatus } from "@crm/db/enums";
import { BookingsService } from "../src/bookings/bookings.service";

const eventDate = "2026-09-23";
const windowStart = "2026-09-23T16:00:00+02:00";
const windowEnd = "2026-09-23T18:00:00+02:00";

type ResourceRow = {
	quantity: number;
	booking: {
		id: string;
		dealId: string;
		status: BookingStatus;
		requestedStartAt: Date | null;
		requestedEndAt: Date | null;
		confirmedStartAt: Date | null;
		confirmedEndAt: Date | null;
		operationalStartAt: Date | null;
		operationalEndAt: Date | null;
		googleCalendarEventId: string | null;
	};
};

describe("booking availability", () => {
	it("returns 5 remaining when 0 of 5 booths are booked", async () => {
		const result = await checkAvailability([]);

		expect(result.totalUnits).toBe(5);
		expect(result.committedUnits).toBe(0);
		expect(result.remainingUnits).toBe(5);
		expect(result.available).toBe(true);
	});

	it("returns 4 remaining when 1 confirmed booth overlaps", async () => {
		const result = await checkAvailability([booking({ quantity: 1 })]);

		expect(result.committedUnits).toBe(1);
		expect(result.remainingUnits).toBe(4);
		expect(result.available).toBe(true);
		expect(result.confirmedOverlaps).toHaveLength(1);
	});

	it("returns 1 remaining when 4 confirmed booths overlap", async () => {
		const result = await checkAvailability([booking({ quantity: 4 })]);

		expect(result.committedUnits).toBe(4);
		expect(result.remainingUnits).toBe(1);
		expect(result.available).toBe(true);
	});

	it("is unavailable when 5 confirmed booths overlap", async () => {
		const result = await checkAvailability([booking({ quantity: 5 })]);

		expect(result.committedUnits).toBe(5);
		expect(result.remainingUnits).toBe(0);
		expect(result.available).toBe(false);
	});

	it("ignores cancelled bookings", async () => {
		const result = await checkAvailability([
			booking({ status: BookingStatus.CANCELLED, quantity: 5 }),
		]);

		expect(result.committedUnits).toBe(0);
		expect(result.remainingUnits).toBe(5);
		expect(result.available).toBe(true);
	});

	it("ignores non-overlapping bookings", async () => {
		const result = await checkAvailability([
			booking({
				operationalStartAt: "2026-09-23T19:00:00+02:00",
				operationalEndAt: "2026-09-23T20:00:00+02:00",
			}),
		]);

		expect(result.committedUnits).toBe(0);
		expect(result.remainingUnits).toBe(5);
		expect(result.confirmedOverlaps).toHaveLength(0);
	});

	it("counts confirmed bookings with unknown time on the same date", async () => {
		const result = await checkAvailability([
			booking({
				confirmedStartAt: null,
				confirmedEndAt: null,
				operationalStartAt: null,
				operationalEndAt: null,
			}),
		]);

		expect(result.committedUnits).toBe(1);
		expect(result.remainingUnits).toBe(4);
		expect(result.uncertainTimeBookings).toHaveLength(1);
	});

	it("does not count a provisional enquiry as committed capacity", async () => {
		const result = await checkAvailability([
			booking({ status: BookingStatus.PROVISIONAL, quantity: 5 }),
		]);

		expect(result.committedUnits).toBe(0);
		expect(result.remainingUnits).toBe(5);
		expect(result.available).toBe(true);
	});

	it("consumes multiple units when quantity is greater than 1", async () => {
		const result = await checkAvailability([booking({ quantity: 2 })]);

		expect(result.committedUnits).toBe(2);
		expect(result.remainingUnits).toBe(3);
		expect(result.available).toBe(true);
	});

	it("keeps requested time when confirmed time differs", async () => {
		const result = await checkAvailability([
			booking({
				requestedStartAt: "2026-09-23T16:00:00+02:00",
				requestedEndAt: "2026-09-23T18:00:00+02:00",
				confirmedStartAt: "2026-09-23T18:30:00+02:00",
				confirmedEndAt: "2026-09-23T20:30:00+02:00",
				operationalStartAt: "2026-09-23T16:30:00+02:00",
				operationalEndAt: "2026-09-23T18:30:00+02:00",
			}),
		]);

		expect(result.confirmedOverlaps[0]).toMatchObject({
			requestedStartAt: "2026-09-23T14:00:00.000Z",
			requestedEndAt: "2026-09-23T16:00:00.000Z",
			confirmedStartAt: "2026-09-23T16:30:00.000Z",
			confirmedEndAt: "2026-09-23T18:30:00.000Z",
			operationalStartAt: "2026-09-23T14:30:00.000Z",
			operationalEndAt: "2026-09-23T16:30:00.000Z",
		});
	});
});

async function checkAvailability(rows: ResourceRow[], quantityRequested = 1) {
	return serviceWith(rows).availability({
		resourceType: "360_PHOTO_BOOTH",
		eventDate,
		startAt: windowStart,
		endAt: windowEnd,
		quantityRequested,
	});
}

function serviceWith(rows: ResourceRow[], totalUnits = 5) {
	const filtered = rows.filter(
		(row) =>
			row.booking.status === BookingStatus.CONFIRMED ||
			row.booking.status === BookingStatus.HELD,
	);
	const fake = {
		bookingResourceCapacity: {
			findUnique: async () => ({ totalUnits }),
		},
		bookingResource: {
			findMany: async () => filtered,
		},
	} as unknown as Db;

	return new BookingsService(fake, {
		touch: async () => undefined,
	} as never);
}

function booking(input: {
	status?: BookingStatus;
	quantity?: number;
	requestedStartAt?: string | null;
	requestedEndAt?: string | null;
	confirmedStartAt?: string | null;
	confirmedEndAt?: string | null;
	operationalStartAt?: string | null;
	operationalEndAt?: string | null;
}): ResourceRow {
	return {
		quantity: input.quantity ?? 1,
		booking: {
			id: `booking-${Math.random()}`,
			dealId: "deal-123",
			status: input.status ?? BookingStatus.CONFIRMED,
			requestedStartAt: nullableAt(
				fieldValue(input, "requestedStartAt", windowStart),
			),
			requestedEndAt: nullableAt(
				fieldValue(input, "requestedEndAt", windowEnd),
			),
			confirmedStartAt: nullableAt(
				fieldValue(input, "confirmedStartAt", windowStart),
			),
			confirmedEndAt: nullableAt(
				fieldValue(input, "confirmedEndAt", windowEnd),
			),
			operationalStartAt: nullableAt(
				fieldValue(input, "operationalStartAt", windowStart),
			),
			operationalEndAt: nullableAt(
				fieldValue(input, "operationalEndAt", windowEnd),
			),
			googleCalendarEventId: null,
		},
	};
}

function fieldValue(
	input: {
		requestedStartAt?: string | null;
		requestedEndAt?: string | null;
		confirmedStartAt?: string | null;
		confirmedEndAt?: string | null;
		operationalStartAt?: string | null;
		operationalEndAt?: string | null;
	},
	key:
		| "requestedStartAt"
		| "requestedEndAt"
		| "confirmedStartAt"
		| "confirmedEndAt"
		| "operationalStartAt"
		| "operationalEndAt",
	fallback: string,
): string | null {
	return Object.hasOwn(input, key) ? (input[key] ?? null) : fallback;
}

function nullableAt(value: string | null): Date | null {
	return value === null ? null : new Date(value);
}
