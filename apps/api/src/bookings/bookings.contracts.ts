import { z } from "zod";

export const availabilityResourceTypes = ["360_PHOTO_BOOTH"] as const;
export const bookingStatuses = [
	"PROVISIONAL",
	"HELD",
	"CONFIRMED",
	"COMPLETED",
	"CANCELLED",
] as const;

export const calendarStatuses = ["NOT_ADDED", "ADDED", "FAILED"] as const;

const bookingKey = z
	.string()
	.trim()
	.min(1)
	.max(120)
	.regex(/^[A-Za-z0-9_.:-]+$/)
	.default("primary");

const nullableOffsetDateTime = z
	.string()
	.datetime({ offset: true })
	.nullable()
	.optional();

export const availabilityInput = z.object({
	resourceType: z.enum(availabilityResourceTypes),
	eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	startAt: z.string().datetime({ offset: true }),
	endAt: z.string().datetime({ offset: true }),
	quantityRequested: z.number().int().positive(),
});

export type AvailabilityInput = z.infer<typeof availabilityInput>;

export const bookingUpsertInput = z.object({
	dealId: z.string().trim().min(1),
	bookingKey,
	status: z.enum(bookingStatuses),
	eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	resource: z.object({
		resourceType: z.enum(availabilityResourceTypes),
		quantity: z.number().int().positive(),
	}),
	requestedStartAt: nullableOffsetDateTime,
	requestedEndAt: nullableOffsetDateTime,
	confirmedStartAt: nullableOffsetDateTime,
	confirmedEndAt: nullableOffsetDateTime,
	operationalStartAt: nullableOffsetDateTime,
	operationalEndAt: nullableOffsetDateTime,
	googleCalendarEventId: z
		.string()
		.trim()
		.min(1)
		.max(240)
		.nullable()
		.optional(),
	calendarStatus: z.enum(calendarStatuses).optional(),
	emailThreadId: z.string().trim().min(1).optional(),
});

export type BookingUpsertInput = z.infer<typeof bookingUpsertInput>;

const bookingAvailabilityLine = z.object({
	bookingId: z.string(),
	dealId: z.string(),
	status: z.enum(["HELD", "CONFIRMED"]),
	quantity: z.number(),
	requestedStartAt: z.string().nullable(),
	requestedEndAt: z.string().nullable(),
	confirmedStartAt: z.string().nullable(),
	confirmedEndAt: z.string().nullable(),
	operationalStartAt: z.string().nullable(),
	operationalEndAt: z.string().nullable(),
	googleCalendarEventId: z.string().nullable(),
});

export const availabilityOutput = z.object({
	resourceType: z.enum(availabilityResourceTypes),
	eventDate: z.string(),
	startAt: z.string(),
	endAt: z.string(),
	totalUnits: z.number(),
	committedUnits: z.number(),
	remainingUnits: z.number(),
	quantityRequested: z.number(),
	available: z.boolean(),
	confirmedOverlaps: z.array(bookingAvailabilityLine),
	uncertainTimeBookings: z.array(bookingAvailabilityLine),
	availabilityConfidence: z.literal("SAFE"),
});

export type AvailabilityOutput = z.infer<typeof availabilityOutput>;

export const bookingResourceOutput = z.object({
	resourceType: z.enum(availabilityResourceTypes),
	quantity: z.number(),
});

export const bookingOutput = z.object({
	bookingId: z.string(),
	dealId: z.string(),
	bookingKey: z.string(),
	status: z.enum(bookingStatuses),
	eventDate: z.string(),
	requestedStartAt: z.string().nullable(),
	requestedEndAt: z.string().nullable(),
	confirmedStartAt: z.string().nullable(),
	confirmedEndAt: z.string().nullable(),
	operationalStartAt: z.string().nullable(),
	operationalEndAt: z.string().nullable(),
	resources: z.array(bookingResourceOutput),
	googleCalendarEventId: z.string().nullable(),
	calendarStatus: z.enum(calendarStatuses),
	emailThreadIds: z.array(z.string()),
});

export type BookingOutput = z.infer<typeof bookingOutput>;

export const bookingByDealOutput = z.object({
	dealId: z.string(),
	bookings: z.array(bookingOutput),
});

export type BookingByDealOutput = z.infer<typeof bookingByDealOutput>;
