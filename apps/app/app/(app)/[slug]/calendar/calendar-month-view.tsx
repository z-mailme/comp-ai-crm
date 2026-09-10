"use client";

import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import type { EventChipProps } from "./calendar-event-colors";
import {
	dayFromKey,
	dayNumber,
	eventIntersectsDay,
	monthGridDayKeys,
	weekdayLabel,
} from "./calendar-grid-model";
import type { CalendarEvent } from "./calendar-workspace";

const CELL_EVENT_LIMIT = 3;

export function CalendarMonthGrid({
	month,
	events,
	todayKey,
	chipProps,
	onSelectEvent,
	hrefForDay,
}: {
	month: string;
	events: CalendarEvent[];
	todayKey: string;
	chipProps: (event: CalendarEvent) => EventChipProps;
	onSelectEvent: (event: CalendarEvent) => void;
	hrefForDay: (dayKey: string) => string;
}) {
	const weeks = monthGridDayKeys(month);
	const monthIndex = dayFromKey(month).getMonth();

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border bg-card">
			<div className="grid grid-cols-7 border-b">
				{(weeks[0] ?? []).map((day) => (
					<div
						key={day}
						className="border-l px-2 py-1.5 text-center text-muted-foreground text-xs first:border-l-0"
					>
						{weekdayLabel(day)}
					</div>
				))}
			</div>
			{weeks.map((week) => (
				<div
					key={week[0]}
					className="grid flex-1 grid-cols-7 border-b last:border-b-0"
				>
					{week.map((day) => {
						const inMonth = dayFromKey(day).getMonth() === monthIndex;
						const dayEvents = events.filter((event) =>
							eventIntersectsDay(event, day),
						);
						const visible = dayEvents.slice(0, CELL_EVENT_LIMIT);
						const hidden = dayEvents.length - visible.length;

						return (
							<div
								key={day}
								className={cn(
									"flex min-h-24 flex-col gap-0.5 border-l p-1 first:border-l-0",
									!inMonth && "bg-muted/30",
									day === todayKey && "bg-muted/60",
								)}
							>
								<Link
									href={hrefForDay(day)}
									className={cn(
										"flex h-6 w-6 items-center justify-center self-end rounded-md text-xs hover:bg-muted",
										day === todayKey &&
											"bg-primary font-medium text-primary-foreground",
										!inMonth && "text-muted-foreground",
									)}
								>
									{dayNumber(day)}
								</Link>
								{visible.map((event) => {
									const chip = chipProps(event);
									return (
										<button
											key={event.id}
											type="button"
											onClick={() => onSelectEvent(event)}
											className={cn(
												"truncate rounded-sm border px-1 py-0.5 text-left text-xs",
												chip.className,
											)}
											style={chip.style}
											title={event.title ?? "Untitled event"}
										>
											{event.title ?? "Untitled event"}
										</button>
									);
								})}
								{hidden > 0 ? (
									<Link
										href={hrefForDay(day)}
										className="px-1 text-muted-foreground text-xs hover:text-foreground"
									>
										+{hidden} more
									</Link>
								) : null}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
