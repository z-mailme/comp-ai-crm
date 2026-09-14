import { BookingResourceType } from "@crm/db/enums";
import { z } from "zod";
import { FINANCE, MINUTE_MS } from "./finance-config";

export type BookingTimingFields = {
	confirmedStartAt: Date | null;
	confirmedEndAt: Date | null;
	operationalStartAt: Date | null;
	operationalEndAt: Date | null;
	requestedStartAt: Date | null;
	requestedEndAt: Date | null;
};

export const operatorLabourRuleValue = z.object({
	currency: z.string().default(FINANCE.operatorLabour.currency),
	shortRateCents: z.number().int().min(0),
	longRateCents: z.number().int().min(0),
	longThresholdMinutes: z.number().int().min(1),
});

export type OperatorLabourRuleValue = z.infer<typeof operatorLabourRuleValue>;

export type OperatorLabourRule = OperatorLabourRuleValue & {
	key: string;
	version: number;
};

export const DEFAULT_OPERATOR_LABOUR_RULE: OperatorLabourRule = {
	key: FINANCE.operatorLabour.ruleKey,
	version: 1,
	currency: FINANCE.operatorLabour.currency,
	shortRateCents: FINANCE.operatorLabour.shortRateCents,
	longRateCents: FINANCE.operatorLabour.longRateCents,
	longThresholdMinutes: FINANCE.operatorLabour.longThresholdMinutes,
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

export function operatorRateCents(
	durationMinutes: number,
	rule: OperatorLabourRule = DEFAULT_OPERATOR_LABOUR_RULE,
): number {
	return durationMinutes >= rule.longThresholdMinutes
		? rule.longRateCents
		: rule.shortRateCents;
}

export function operatorLabourCostCents(
	durationMinutes: number | null,
	operatorCount: number | null,
	rule: OperatorLabourRule = DEFAULT_OPERATOR_LABOUR_RULE,
): number | null {
	if (durationMinutes === null || operatorCount === null) return null;
	return operatorCount * operatorRateCents(durationMinutes, rule);
}
