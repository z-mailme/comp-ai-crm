export type GridEvent = {
	id: string;
	title: string | null;
	startsAt: string;
	endsAt: string;
	isAllDay: boolean;
	sourceCalendar: string;
};

export type PositionedEvent<T extends GridEvent = GridEvent> = {
	event: T;
	startMinutes: number;
	endMinutes: number;
	column: number;
	columns: number;
	continuesFromPreviousDay: boolean;
	continuesIntoNextDay: boolean;
};

export const GRID_HOURS = 24;
export const GRID_HOUR_VALUES = Array.from(
	{ length: GRID_HOURS },
	(_, hour) => hour,
);
export const MINUTES_PER_DAY = 24 * 60;

export function localDayKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function dayFromKey(dayKey: string): Date {
	const [year, month, day] = dayKey.split("-").map(Number);
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDaysToKey(dayKey: string, days: number): string {
	const date = dayFromKey(dayKey);
	date.setDate(date.getDate() + days);
	return localDayKey(date);
}

export function weekDayKeys(dayKey: string): string[] {
	const date = dayFromKey(dayKey);
	const start = addDaysToKey(dayKey, -date.getDay());
	return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
}

export function monthGridDayKeys(dayKey: string): string[][] {
	const date = dayFromKey(dayKey);
	const first = new Date(date.getFullYear(), date.getMonth(), 1);
	const gridStart = addDaysToKey(localDayKey(first), -first.getDay());

	const weeks: string[][] = [];
	let cursor = gridStart;
	for (let week = 0; week < 6; week += 1) {
		const days = Array.from({ length: 7 }, (_, index) =>
			addDaysToKey(cursor, index),
		);
		weeks.push(days);
		cursor = addDaysToKey(cursor, 7);
		if (dayFromKey(cursor).getMonth() !== date.getMonth() && week >= 3) break;
	}
	return weeks;
}

export function minutesIntoDay(iso: string): number {
	const date = new Date(iso);
	return date.getHours() * 60 + date.getMinutes();
}

export function eventIntersectsDay(event: GridEvent, dayKey: string): boolean {
	const dayStart = dayFromKey(dayKey).getTime();
	const dayEnd = dayStart + MINUTES_PER_DAY * 60 * 1000;
	const starts = new Date(event.startsAt).getTime();
	const ends = new Date(event.endsAt).getTime();
	return starts < dayEnd && ends > dayStart;
}

export function spansMultipleDays(event: GridEvent): boolean {
	return (
		localDayKey(new Date(event.startsAt)) !==
		localDayKey(new Date(new Date(event.endsAt).getTime() - 1))
	);
}

export function isAllDayRow<T extends GridEvent>(event: T): boolean {
	if (event.isAllDay) return true;
	const durationMs =
		new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
	return durationMs >= 24 * 60 * 60 * 1000;
}

export function allDayEventsForDay<T extends GridEvent>(
	events: readonly T[],
	dayKey: string,
): T[] {
	return events.filter(
		(event) => isAllDayRow(event) && eventIntersectsDay(event, dayKey),
	);
}

export function timedEventsForDay<T extends GridEvent>(
	events: readonly T[],
	dayKey: string,
): T[] {
	return events.filter(
		(event) => !isAllDayRow(event) && eventIntersectsDay(event, dayKey),
	);
}

type TimedEntry<T extends GridEvent> = {
	event: T;
	start: number;
	end: number;
	column: number;
	continuesFromPreviousDay: boolean;
	continuesIntoNextDay: boolean;
};

export function layoutTimedEvents<T extends GridEvent>(
	events: readonly T[],
	dayKey: string,
): PositionedEvent<T>[] {
	const dayStart = dayFromKey(dayKey).getTime();
	const dayEnd = dayStart + MINUTES_PER_DAY * 60 * 1000;

	const timed: TimedEntry<T>[] = events
		.filter((event) => !isAllDayRow(event) && eventIntersectsDay(event, dayKey))
		.map((event) => {
			const starts = new Date(event.startsAt).getTime();
			const ends = new Date(event.endsAt).getTime();
			return {
				event,
				start: Math.max(starts, dayStart),
				end: Math.min(Math.max(ends, starts + 15 * 60 * 1000), dayEnd),
				column: 0,
				continuesFromPreviousDay: starts < dayStart,
				continuesIntoNextDay: ends > dayEnd,
			};
		})
		.sort((a, b) => a.start - b.start || b.end - a.end);

	const positioned: PositionedEvent<T>[] = [];
	let cluster: TimedEntry<T>[] = [];
	let clusterEnd = -1;
	let clusterColumns = 0;

	const flush = () => {
		for (const entry of cluster) {
			positioned.push({
				event: entry.event,
				startMinutes: (entry.start - dayStart) / 60_000,
				endMinutes: (entry.end - dayStart) / 60_000,
				column: entry.column,
				columns: Math.max(clusterColumns, 1),
				continuesFromPreviousDay: entry.continuesFromPreviousDay,
				continuesIntoNextDay: entry.continuesIntoNextDay,
			});
		}
		cluster = [];
		clusterEnd = -1;
		clusterColumns = 0;
	};

	for (const entry of timed) {
		if (cluster.length > 0 && entry.start >= clusterEnd) flush();

		const used = new Set(
			cluster
				.filter((existing) => existing.end > entry.start)
				.map((existing) => existing.column),
		);
		let column = 0;
		while (used.has(column)) column += 1;

		entry.column = column;
		cluster.push(entry);
		clusterEnd = Math.max(clusterEnd, entry.end);
		clusterColumns = Math.max(clusterColumns, column + 1);
	}

	flush();
	return positioned;
}

export function hourLabel(hour: number): string {
	const date = new Date(2026, 0, 1, hour);
	return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(date);
}

export function timeLabel(iso: string): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(iso));
}

export function dayNumber(dayKey: string): number {
	return dayFromKey(dayKey).getDate();
}

export function weekdayLabel(dayKey: string): string {
	return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
		dayFromKey(dayKey),
	);
}

export function monthHeading(dayKey: string): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	}).format(dayFromKey(dayKey));
}

export function weekHeading(dayKeys: readonly string[]): string {
	const first = dayFromKey(dayKeys[0] ?? localDayKey(new Date()));
	const last = dayFromKey(
		dayKeys[dayKeys.length - 1] ?? localDayKey(new Date()),
	);
	const format = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	});
	return `${format.format(first)} – ${format.format(last)}, ${last.getFullYear()}`;
}
