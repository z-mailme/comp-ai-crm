import { DAY_MS } from "./business-os.config";

const WEEK_MS = 7 * DAY_MS;

export function utcWeekStarts(now: Date, weeks: number): Date[] {
	const today = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const mondayOffset = (today.getUTCDay() + 6) % 7;
	const currentMonday = today.getTime() - mondayOffset * DAY_MS;
	const starts: Date[] = [];

	for (let index = weeks - 1; index >= 0; index--) {
		starts.push(new Date(currentMonday - index * WEEK_MS));
	}

	return starts;
}

export function countIntoWeeks(dates: Date[], starts: Date[]): number[] {
	const counts = starts.map(() => 0);

	for (const date of dates) {
		const time = date.getTime();

		for (let index = starts.length - 1; index >= 0; index--) {
			const start = starts[index];

			if (start && time >= start.getTime()) {
				counts[index] = (counts[index] ?? 0) + 1;
				break;
			}
		}
	}

	return counts;
}
