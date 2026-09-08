export type CalendarView = "month" | "week" | "day" | "agenda";

export type CalendarQueryInput = {
	view: CalendarView;
	date: string;
	search: string;
};

const VIEWS = new Set<CalendarView>(["month", "week", "day", "agenda"]);

export async function loadCalendarSearchParams(
	searchParams: PageProps<"/[slug]/calendar">["searchParams"],
): Promise<CalendarQueryInput> {
	const params = await searchParams;

	return {
		view: parseView(readParam(params.view)),
		date: readParam(params.date) ?? today(),
		search: readParam(params.search) ?? "",
	};
}

export function parseCalendarParams(
	params: URLSearchParams,
): CalendarQueryInput {
	return {
		view: parseView(params.get("view")),
		date: params.get("date") || today(),
		search: params.get("search") || "",
	};
}

function parseView(value: string | null): CalendarView {
	if (value && VIEWS.has(value as CalendarView)) return value as CalendarView;
	return "week";
}

function readParam(value: string | string[] | undefined): string | null {
	if (Array.isArray(value)) return value[0] ?? null;
	return value ?? null;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}
