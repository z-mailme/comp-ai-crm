import { describe, expect, it } from "bun:test";
import { calendarRange } from "../src/business-os/calendar-range";

describe("calendarRange", () => {
	it("anchors a UTC week on Sunday when no timezone is given", () => {
		const range = calendarRange({ view: "week", date: "2026-09-07" });
		expect(range.start.toISOString()).toBe("2026-09-06T00:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-09-13T00:00:00.000Z");
	});

	it("bounds a day by local midnight in the user's timezone", () => {
		const range = calendarRange({
			view: "day",
			date: "2026-09-07",
			timezone: "Africa/Johannesburg",
		});
		expect(range.start.toISOString()).toBe("2026-09-06T22:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-09-07T22:00:00.000Z");
	});

	it("bounds a week by local midnight in the user's timezone", () => {
		const range = calendarRange({
			view: "week",
			date: "2026-09-07",
			timezone: "Africa/Johannesburg",
		});
		expect(range.start.toISOString()).toBe("2026-09-05T22:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-09-12T22:00:00.000Z");
	});

	it("extends a month to the full visible grid weeks", () => {
		const range = calendarRange({ view: "month", date: "2026-09-15" });
		expect(range.start.toISOString()).toBe("2026-08-30T00:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-10-04T00:00:00.000Z");
	});

	it("extends a timezone month grid to local midnights", () => {
		const range = calendarRange({
			view: "month",
			date: "2026-09-15",
			timezone: "Africa/Johannesburg",
		});
		expect(range.start.toISOString()).toBe("2026-08-29T22:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-10-03T22:00:00.000Z");
	});

	it("covers a month that starts at the grid edge", () => {
		const range = calendarRange({ view: "month", date: "2026-02-10" });
		expect(range.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
	});

	it("keeps agenda a fixed forward window", () => {
		const range = calendarRange({ view: "agenda", date: "2026-09-07" });
		expect(range.start.toISOString()).toBe("2026-09-07T00:00:00.000Z");
		expect(range.end.toISOString()).toBe("2026-10-07T00:00:00.000Z");
	});

	it("falls back to UTC for an invalid timezone", () => {
		const range = calendarRange({
			view: "day",
			date: "2026-09-07",
			timezone: "Not/AZone",
		});
		expect(range.start.toISOString()).toBe("2026-09-07T00:00:00.000Z");
	});

	it("falls back to today for an invalid date", () => {
		const range = calendarRange({ view: "day", date: "not-a-date" });
		expect(range.start.getTime()).toBeLessThan(range.end.getTime());
	});
});
