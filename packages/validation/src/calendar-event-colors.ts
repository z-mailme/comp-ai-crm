import { z } from "zod";

export const calendarEventColorId = z.enum([
	"tomato",
	"flamingo",
	"tangerine",
	"banana",
	"sage",
	"basil",
	"peacock",
	"blueberry",
	"lavender",
	"grape",
	"graphite",
]);

export type CalendarEventColorId = z.infer<typeof calendarEventColorId>;

export const CALENDAR_EVENT_COLORS: {
	id: CalendarEventColorId;
	label: string;
}[] = [
	{ id: "tomato", label: "Tomato" },
	{ id: "flamingo", label: "Flamingo" },
	{ id: "tangerine", label: "Tangerine" },
	{ id: "banana", label: "Banana" },
	{ id: "sage", label: "Sage" },
	{ id: "basil", label: "Basil" },
	{ id: "peacock", label: "Peacock" },
	{ id: "blueberry", label: "Blueberry" },
	{ id: "lavender", label: "Lavender" },
	{ id: "grape", label: "Grape" },
	{ id: "graphite", label: "Graphite" },
];
