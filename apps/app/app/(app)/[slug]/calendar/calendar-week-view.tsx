"use client";

import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { useSeconds } from "@/lib/use-seconds";
import { colorChipProps, type EventChipProps } from "./calendar-event-colors";
import {
	allDayEventsForDay,
	dayNumber,
	GRID_HOUR_VALUES,
	hourLabel,
	layoutTimedEvents,
	localDayKey,
	minutesIntoDay,
	type PositionedEvent,
	timeLabel,
	weekdayLabel,
} from "./calendar-grid-model";
import type { CalendarEvent } from "./calendar-workspace";

const HOUR_PX = 48;
const ALL_DAY_LIMIT = 3;

export function CalendarTimeGrid({
	days,
	events,
	todayKey,
	chipProps,
	onSelectEvent,
	hrefForDay,
}: {
	days: string[];
	events: CalendarEvent[];
	todayKey: string;
	chipProps: (event: CalendarEvent) => EventChipProps;
	onSelectEvent: (event: CalendarEvent) => void;
	hrefForDay: (dayKey: string) => string;
}) {
	const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card">
			<div className="grid border-b" style={{ gridTemplateColumns: columns }}>
				<div />
				{days.map((day) => (
					<Link
						key={day}
						href={hrefForDay(day)}
						className={cn(
							"flex flex-col items-center gap-0.5 border-l px-1 py-2 text-center hover:bg-muted",
							day === todayKey && "bg-muted/60",
						)}
					>
						<span className="text-muted-foreground text-xs">
							{weekdayLabel(day)}
						</span>
						<span
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-md text-sm",
								day === todayKey &&
									"bg-primary font-medium text-primary-foreground",
							)}
						>
							{dayNumber(day)}
						</span>
					</Link>
				))}
			</div>

			<div className="grid border-b" style={{ gridTemplateColumns: columns }}>
				<div className="px-2 py-1 text-right text-muted-foreground text-xs">
					All day
				</div>
				{days.map((day) => (
					<AllDayCell
						key={day}
						events={allDayEventsForDay(events, day)}
						chipProps={chipProps}
						onSelectEvent={onSelectEvent}
						href={hrefForDay(day)}
					/>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div
					className="grid"
					style={{
						gridTemplateColumns: columns,
						height: HOUR_PX * 24,
					}}
				>
					<TimeGutter />
					{days.map((day) => (
						<DayColumn
							key={day}
							day={day}
							events={events}
							isToday={day === todayKey}
							chipProps={chipProps}
							onSelectEvent={onSelectEvent}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function TimeGutter() {
	return (
		<div className="relative">
			{GRID_HOUR_VALUES.map((hour) => (
				<div
					key={hour}
					className="absolute right-2 w-full text-right text-muted-foreground text-xs"
					style={{ top: hour * HOUR_PX - 6 }}
				>
					{hour === 0 ? "" : hourLabel(hour)}
				</div>
			))}
		</div>
	);
}

function DayColumn({
	day,
	events,
	isToday,
	chipProps,
	onSelectEvent,
}: {
	day: string;
	events: CalendarEvent[];
	isToday: boolean;
	chipProps: (event: CalendarEvent) => EventChipProps;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	const positioned = layoutTimedEvents(events, day);

	return (
		<div className={cn("relative border-l", isToday && "bg-muted/40")}>
			{GRID_HOUR_VALUES.map((hour) => (
				<div
					key={hour}
					className="absolute right-0 left-0 border-border/60 border-t"
					style={{ top: hour * HOUR_PX }}
				/>
			))}
			{isToday ? <NowIndicator /> : null}
			{positioned.map((entry) => (
				<TimedEventChip
					key={entry.event.id}
					entry={entry}
					chipProps={chipProps}
					onSelectEvent={onSelectEvent}
				/>
			))}
		</div>
	);
}

function TimedEventChip({
	entry,
	chipProps,
	onSelectEvent,
}: {
	entry: PositionedEvent<CalendarEvent>;
	chipProps: (event: CalendarEvent) => EventChipProps;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	const top = (entry.startMinutes / 60) * HOUR_PX;
	const height = Math.max(
		((entry.endMinutes - entry.startMinutes) / 60) * HOUR_PX,
		18,
	);
	const width = 100 / entry.columns;
	const left = entry.column * width;
	const tall = height >= 34;
	const chip = chipProps(entry.event);

	return (
		<button
			type="button"
			onClick={() => onSelectEvent(entry.event)}
			className={cn(
				"absolute overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs leading-tight",
				chip.className,
			)}
			style={{
				top,
				height,
				left: `${left}%`,
				width: `calc(${width}% - 2px)`,
				...chip.style,
			}}
			title={entry.event.title ?? "Untitled event"}
		>
			<span className="block truncate font-medium">
				{entry.event.title ?? "Untitled event"}
			</span>
			{tall ? (
				<span className="block truncate opacity-80">
					{entry.continuesFromPreviousDay ? "… " : ""}
					{timeLabel(entry.event.startsAt)} – {timeLabel(entry.event.endsAt)}
					{entry.continuesIntoNextDay ? " …" : ""}
				</span>
			) : null}
		</button>
	);
}

function AllDayCell({
	events,
	chipProps,
	onSelectEvent,
	href,
}: {
	events: CalendarEvent[];
	chipProps: (event: CalendarEvent) => EventChipProps;
	onSelectEvent: (event: CalendarEvent) => void;
	href: string;
}) {
	const visible = events.slice(0, ALL_DAY_LIMIT);
	const hidden = events.length - visible.length;

	return (
		<div className="flex min-h-7 flex-col gap-0.5 border-l px-1 py-1">
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
					href={href}
					className="px-1 text-muted-foreground text-xs hover:text-foreground"
				>
					+{hidden} more
				</Link>
			) : null}
		</div>
	);
}

function NowIndicator() {
	const now = useSeconds();
	const minutes = minutesIntoDay(new Date(now).toISOString());
	const top = (minutes / 60) * HOUR_PX;

	return (
		<div
			className="pointer-events-none absolute right-0 left-0 z-10 border-primary border-t-2"
			style={{ top }}
		>
			<div className="-ml-1 -mt-1 h-2 w-2 rounded-md bg-primary" />
		</div>
	);
}

export function useTodayKey(): string {
	const now = useSeconds();
	return now === 0 ? "" : localDayKey(new Date(now));
}
