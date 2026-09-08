"use client";

import { cn } from "@crm/ui/lib/utils";
import {
	addDaysToKey,
	eventIntersectsDay,
	isAllDayRow,
	timeLabel,
	weekdayLabel,
} from "./calendar-grid-model";
import type { CalendarEvent } from "./calendar-workspace";

export function CalendarSchedule({
	fromDay,
	dayCount,
	events,
	todayKey,
	toneClass,
	onSelectEvent,
}: {
	fromDay: string;
	dayCount: number;
	events: CalendarEvent[];
	todayKey: string;
	toneClass: (calendar: string) => string;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	const days = Array.from({ length: dayCount }, (_, index) =>
		addDaysToKey(fromDay, index),
	);
	const nonEmpty = days.filter((day) =>
		events.some((event) => eventIntersectsDay(event, day)),
	);

	if (nonEmpty.length === 0) {
		return (
			<div className="rounded-lg border bg-card p-6 text-muted-foreground text-sm">
				No events in this range.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{nonEmpty.map((day) => (
				<section key={day} className="rounded-lg border bg-card">
					<h2
						className={cn(
							"border-b px-3 py-2 font-medium text-sm",
							day === todayKey && "text-primary",
						)}
					>
						{weekdayLabel(day)}{" "}
						{new Intl.DateTimeFormat(undefined, {
							month: "short",
							day: "numeric",
						}).format(new Date(`${day}T00:00:00`))}
						{day === todayKey ? " · Today" : ""}
					</h2>
					<ul className="divide-y">
						{events
							.filter((event) => eventIntersectsDay(event, day))
							.map((event) => (
								<li key={`${day}-${event.id}`}>
									<button
										type="button"
										onClick={() => onSelectEvent(event)}
										className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
									>
										<span className="w-28 shrink-0 text-muted-foreground text-xs">
											{isAllDayRow(event)
												? "All day"
												: `${timeLabel(event.startsAt)} – ${timeLabel(event.endsAt)}`}
										</span>
										<span
											className={cn(
												"h-2.5 w-2.5 shrink-0 rounded-sm border",
												toneClass(event.sourceCalendar),
											)}
										/>
										<span className="truncate text-sm">
											{event.title ?? "Untitled event"}
										</span>
									</button>
								</li>
							))}
					</ul>
				</section>
			))}
		</div>
	);
}
