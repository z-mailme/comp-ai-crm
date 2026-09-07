import { describe, expect, it } from "bun:test";
import {
	addDaysToKey,
	allDayEventsForDay,
	dayFromKey,
	eventIntersectsDay,
	isAllDayRow,
	layoutTimedEvents,
	localDayKey,
	monthGridDayKeys,
	spansMultipleDays,
	timedEventsForDay,
	weekDayKeys,
} from "../app/(app)/[slug]/calendar/calendar-grid-model";

function event(id: string, startsAt: string, endsAt: string, isAllDay = false) {
	return { id, title: id, startsAt, endsAt, isAllDay, sourceCalendar: "Test" };
}

describe("calendar grid model", () => {
	it("builds a Sunday-start week around any day", () => {
		const week = weekDayKeys("2026-09-07");
		expect(week[0]).toBe("2026-09-06");
		expect(week[6]).toBe("2026-09-12");
		expect(weekDayKeys("2026-09-06")[0]).toBe("2026-09-06");
	});

	it("round-trips day keys through local dates", () => {
		expect(localDayKey(dayFromKey("2026-02-28"))).toBe("2026-02-28");
		expect(addDaysToKey("2026-02-28", 1)).toBe("2026-03-01");
		expect(addDaysToKey("2026-01-05", -7)).toBe("2025-12-29");
	});

	it("builds a month grid covering the whole visible month", () => {
		const weeks = monthGridDayKeys("2026-09-15");
		expect(weeks[0]?.[0]).toBe("2026-08-30");
		const flat = weeks.flat();
		expect(flat).toContain("2026-09-01");
		expect(flat).toContain("2026-09-30");
		expect(flat.length % 7).toBe(0);
		expect(flat[flat.length - 1]).toBe("2026-10-03");
	});

	it("intersects events with a day using strict bounds", () => {
		const meeting = event("m", "2026-09-07T09:00:00", "2026-09-07T10:00:00");
		expect(eventIntersectsDay(meeting, "2026-09-07")).toBe(true);
		expect(eventIntersectsDay(meeting, "2026-09-08")).toBe(false);

		const overnight = event("o", "2026-09-07T22:00:00", "2026-09-08T01:00:00");
		expect(eventIntersectsDay(overnight, "2026-09-07")).toBe(true);
		expect(eventIntersectsDay(overnight, "2026-09-08")).toBe(true);
	});

	it("treats all-day and multi-day events as all-day-row entries", () => {
		const allDay = event(
			"a",
			"2026-09-07T00:00:00",
			"2026-09-08T00:00:00",
			true,
		);
		const multi = event("m", "2026-09-07T10:00:00", "2026-09-08T10:00:00");
		const single = event("s", "2026-09-07T10:00:00", "2026-09-07T11:00:00");

		expect(isAllDayRow(allDay)).toBe(true);
		expect(spansMultipleDays(multi)).toBe(true);
		expect(isAllDayRow(single)).toBe(false);
		expect(allDayEventsForDay([allDay, single], "2026-09-07")).toHaveLength(1);
		expect(timedEventsForDay([allDay, single], "2026-09-07")).toHaveLength(1);
	});

	it("lays out overlapping events in separate columns", () => {
		const a = event("a", "2026-09-07T09:00:00", "2026-09-07T10:00:00");
		const b = event("b", "2026-09-07T09:30:00", "2026-09-07T10:30:00");
		const c = event("c", "2026-09-07T11:00:00", "2026-09-07T12:00:00");

		const laidOut = layoutTimedEvents([a, b, c], "2026-09-07");
		const byId = new Map(laidOut.map((entry) => [entry.event.id, entry]));

		expect(laidOut).toHaveLength(3);
		expect(byId.get("a")?.columns).toBe(2);
		expect(byId.get("b")?.columns).toBe(2);
		expect(byId.get("a")?.column).toBe(0);
		expect(byId.get("b")?.column).toBe(1);
		expect(byId.get("c")?.columns).toBe(1);
		expect(byId.get("a")?.startMinutes).toBe(540);
		expect(byId.get("b")?.endMinutes).toBe(630);
	});

	it("splits a cluster when events no longer overlap", () => {
		const a = event("a", "2026-09-07T09:00:00", "2026-09-07T10:00:00");
		const b = event("b", "2026-09-07T09:30:00", "2026-09-07T10:30:00");
		const c = event("c", "2026-09-07T10:00:00", "2026-09-07T10:15:00");

		const laidOut = layoutTimedEvents([a, b, c], "2026-09-07");
		const byId = new Map(laidOut.map((entry) => [entry.event.id, entry]));

		expect(byId.get("c")?.columns).toBe(2);
		expect(byId.get("c")?.column).toBe(0);
	});

	it("clamps multi-day segments to the day and marks continuation", () => {
		const overnight = event("o", "2026-09-07T22:00:00", "2026-09-08T02:00:00");

		const [first] = layoutTimedEvents([overnight], "2026-09-07");
		const [second] = layoutTimedEvents([overnight], "2026-09-08");

		expect(first?.startMinutes).toBe(1320);
		expect(first?.endMinutes).toBe(1440);
		expect(first?.continuesIntoNextDay).toBe(true);
		expect(first?.continuesFromPreviousDay).toBe(false);

		expect(second?.startMinutes).toBe(0);
		expect(second?.endMinutes).toBe(120);
		expect(second?.continuesFromPreviousDay).toBe(true);
		expect(second?.continuesIntoNextDay).toBe(false);
	});

	it("enforces a minimum visible duration for zero-length events", () => {
		const point = event("p", "2026-09-07T09:00:00", "2026-09-07T09:00:00");
		const [laidOut] = layoutTimedEvents([point], "2026-09-07");
		expect(laidOut?.endMinutes).toBe(555);
	});
});
