import type { CalendarEventColorId } from "@crm/validation/calendar-event-colors";
import type { CSSProperties } from "react";

export type EventChipProps = {
	className: string;
	style?: CSSProperties;
};

const EVENT_COLOR_CHIPS: Record<
	CalendarEventColorId,
	{ background: string; foreground: string }
> = {
	tomato: { background: "#D93025", foreground: "#FFFFFF" },
	flamingo: { background: "#E67C73", foreground: "#202124" },
	tangerine: { background: "#F4511E", foreground: "#202124" },
	banana: { background: "#F6BF26", foreground: "#202124" },
	sage: { background: "#33B679", foreground: "#202124" },
	basil: { background: "#0B8043", foreground: "#FFFFFF" },
	peacock: { background: "#039BE5", foreground: "#202124" },
	blueberry: { background: "#3F51B5", foreground: "#FFFFFF" },
	lavender: { background: "#7986CB", foreground: "#202124" },
	grape: { background: "#8E24AA", foreground: "#FFFFFF" },
	graphite: { background: "#616161", foreground: "#FFFFFF" },
};

export function colorChipProps(
	colorOverride: CalendarEventColorId | null,
): EventChipProps | null {
	if (!colorOverride) return null;
	const chip = EVENT_COLOR_CHIPS[colorOverride];
	return {
		className: "border-transparent",
		style: { backgroundColor: chip.background, color: chip.foreground },
	};
}

export function colorSwatchStyle(colorId: CalendarEventColorId): CSSProperties {
	return { backgroundColor: EVENT_COLOR_CHIPS[colorId].background };
}
