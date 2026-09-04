import { z } from "zod";

export const availabilityResourceTypes = ["360_PHOTO_BOOTH"] as const;

export const availabilityInput = z.object({
	resourceType: z.enum(availabilityResourceTypes),
	eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	startAt: z.string().datetime({ offset: true }),
	endAt: z.string().datetime({ offset: true }),
	quantityRequested: z.number().int().positive(),
});

export type AvailabilityInput = z.infer<typeof availabilityInput>;

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
