import { BookingResourceType } from "@crm/db/enums";
import { FINANCE, MINUTE_MS } from "./finance-config";

export type BookingTimingFields = {
	confirmedStartAt: Date | null;
	confirmedEndAt: Date | null;
	operationalStartAt: Date | null;
	operationalEndAt: Date | null;
	requestedStartAt: Date | null;
	requestedEndAt: Date | null;
};

export function bookingDurationMinutes(
	booking: BookingTimingFields,
): number | null {
	const pairs: [Date | null, Date | null][] = [
		[booking.confirmedStartAt, booking.confirmedEndAt],
		[booking.operationalStartAt, booking.operationalEndAt],
		[booking.requestedStartAt, booking.requestedEndAt],
	];

	for (const [start, end] of pairs) {
		if (!start || !end) continue;
		const minutes = Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
		if (minutes > 0) return minutes;
	}

	return null;
}

export function operatorCountOf(
	resources: { resourceType: BookingResourceType; quantity: number }[],
): number | null {
	const row = resources.find(
		(resource) => resource.resourceType === BookingResourceType.OPERATOR,
	);
	return row ? row.quantity : null;
}

export function operatorRateCents(durationMinutes: number): number {
	return durationMinutes >= FINANCE.operatorLabour.longThresholdMinutes
		? FINANCE.operatorLabour.longRateCents
		: FINANCE.operatorLabour.shortRateCents;
}

export function operatorLabourCostCents(
	durationMinutes: number | null,
	operatorCount: number | null,
): number | null {
	if (durationMinutes === null || operatorCount === null) return null;
	return operatorCount * operatorRateCents(durationMinutes);
}
