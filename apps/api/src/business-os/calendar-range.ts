const DAY_MS = 24 * 60 * 60 * 1000;
const AGENDA_DAYS = 30;

export type CalendarRangeView = "month" | "week" | "day" | "agenda";

export type CalendarRangeInput = {
	view: CalendarRangeView;
	date?: string;
	timezone?: string;
};

export type CalendarRange = {
	start: Date;
	end: Date;
};

export function calendarRange(input: CalendarRangeInput): CalendarRange {
	const timeZone = normalizeTimeZone(input.timezone);
	const selected = civilDate(input.date, timeZone);

	if (input.view === "day") {
		return {
			start: localMidnightUtc(selected, timeZone),
			end: localMidnightUtc(addDays(selected, 1), timeZone),
		};
	}

	if (input.view === "agenda") {
		return {
			start: localMidnightUtc(selected, timeZone),
			end: localMidnightUtc(addDays(selected, AGENDA_DAYS), timeZone),
		};
	}

	if (input.view === "month") {
		const monthStart = new Date(
			Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1),
		);
		const gridStart = addDays(monthStart, -monthStart.getUTCDay());
		const nextMonth = new Date(
			Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 1),
		);
		const gridEnd = addDays(nextMonth, (7 - nextMonth.getUTCDay()) % 7);
		return {
			start: localMidnightUtc(gridStart, timeZone),
			end: localMidnightUtc(gridEnd, timeZone),
		};
	}

	const weekStart = addDays(selected, -selected.getUTCDay());
	return {
		start: localMidnightUtc(weekStart, timeZone),
		end: localMidnightUtc(addDays(weekStart, 7), timeZone),
	};
}

function civilDate(
	date: string | undefined,
	timeZone: string | undefined,
): Date {
	if (date) {
		const parsed = new Date(`${date}T00:00:00.000Z`);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}

	const now = new Date();
	if (!timeZone) {
		return new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
		);
	}

	const parts = zonedParts(now, timeZone);
	return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function localMidnightUtc(civil: Date, timeZone: string | undefined): Date {
	if (!timeZone) return civil;

	let instant = civil.getTime() - offsetMs(civil, timeZone);
	instant = civil.getTime() - offsetMs(new Date(instant), timeZone);
	return new Date(instant);
}

function offsetMs(instant: Date, timeZone: string): number {
	const parts = zonedParts(instant, timeZone);
	const asUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

type ZonedParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function zonedParts(instant: Date, timeZone: string): ZonedParts {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const parts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
	for (const part of formatter.formatToParts(instant)) {
		if (part.type === "literal") continue;
		parts[part.type as keyof typeof parts] = Number(part.value);
	}
	return parts;
}

function normalizeTimeZone(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return value;
	} catch {
		return undefined;
	}
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DAY_MS);
}
