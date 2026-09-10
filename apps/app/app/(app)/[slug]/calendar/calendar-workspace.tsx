"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Search from "@carbon/icons-react/es/Search";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CalendarSchedule } from "./calendar-agenda-view";
import { CalendarEventDialog } from "./calendar-event-dialog";
import {
	addDaysToKey,
	dayFromKey,
	localDayKey,
	monthHeading,
	weekDayKeys,
	weekHeading,
} from "./calendar-grid-model";
import { CalendarMonthGrid } from "./calendar-month-view";
import {
	type CalendarQueryInput,
	type CalendarView,
	parseCalendarParams,
} from "./calendar-search-params";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarTimeGrid, useTodayKey } from "./calendar-week-view";
import { useHiddenCalendars } from "./use-hidden-calendars";

export type CalendarOutput = RouterOutputs["businessOs"]["calendar"];
export type CalendarEvent = CalendarOutput["events"][number];
export type CalendarListEntry = CalendarOutput["calendars"][number];

const VIEW_LABELS = {
	week: "Week",
	day: "Day",
	month: "Month",
	agenda: "Agenda",
} satisfies Record<CalendarView, string>;

const AGENDA_DAY_COUNT = 30;

const CHIP_TONES = [
	"border-primary/40 bg-primary/10 text-primary",
	"border-border bg-accent text-accent-foreground",
	"border-border bg-muted text-foreground",
] as const;

const DOT_TONES = ["bg-primary", "bg-muted-foreground", "bg-border"] as const;

export function CalendarWorkspace() {
	const trpc = useTRPC();
	const searchParams = useSearchParams();
	const workspaceUrl = useWorkspaceUrl();
	const input = parseCalendarParams(searchParams);
	const timezone = useMemo(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
		[],
	);
	const calendar = useQuery(
		trpc.businessOs.calendar.queryOptions({ ...input, timezone }),
	);
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
		null,
	);
	const [hiddenCalendars, toggleCalendar] = useHiddenCalendars();
	const todayKey = useTodayKey();

	if (calendar.isPending || !calendar.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (calendar.isError) {
		return (
			<div className="rounded-lg border bg-card p-6 text-sm">
				<p className="font-medium">Calendar failed to load.</p>
				<p className="mt-1 text-muted-foreground">
					Check your connection and try again.
				</p>
			</div>
		);
	}

	const data = calendar.data;
	const calendars = data.calendars;
	const toneIndex = (name: string): number => {
		const index = calendars.findIndex((entry) => entry.name === name);
		return index < 0 ? 0 : index % CHIP_TONES.length;
	};
	const toneClass = (name: string): string =>
		CHIP_TONES[toneIndex(name)] ?? "border-border bg-muted text-foreground";
	const dotClass = (name: string): string =>
		DOT_TONES[toneIndex(name)] ?? "bg-border";

	const events = data.events.filter(
		(event) => !hiddenCalendars.has(event.sourceCalendar),
	);

	const hrefFor = (next: CalendarQueryInput) =>
		workspaceUrl(calendarHref(next));
	const hrefForDay = (day: string) =>
		hrefFor({ ...input, view: "day", date: day });
	const hrefForMonth = (day: string) =>
		hrefFor({ ...input, view: "month", date: day });

	const weekDays = weekDayKeys(input.date);
	const monthDaysCount = daysInMonth(input.date);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<div className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-wrap items-center gap-2">
					<Button asChild variant="outline" size="icon" aria-label="Previous">
						<Link href={hrefFor(stepDate(input, -1))}>
							<Icon icon={ArrowLeft} />
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link href={hrefFor({ ...input, date: todayKey || input.date })}>
							Today
						</Link>
					</Button>
					<Button asChild variant="outline" size="icon" aria-label="Next">
						<Link href={hrefFor(stepDate(input, 1))}>
							<Icon icon={ArrowRight} />
						</Link>
					</Button>
					<input
						type="date"
						name="date"
						defaultValue={input.date}
						form="calendar-filter"
						className="h-9 rounded-md border bg-background px-3 text-sm"
					/>
					<h2 className="px-1 font-medium text-sm">{heading(input)}</h2>
					<fieldset className="flex overflow-hidden rounded-md border">
						<legend className="sr-only">Calendar view</legend>
						{Object.entries(VIEW_LABELS).map(([view, label]) => (
							<Link
								key={view}
								href={hrefFor({ ...input, view: view as CalendarView })}
								className={cn(
									"px-3 py-2 text-sm hover:bg-muted",
									input.view === view && "bg-muted font-medium text-foreground",
								)}
								aria-current={input.view === view ? "page" : undefined}
							>
								{label}
							</Link>
						))}
					</fieldset>
				</div>
				<form
					id="calendar-filter"
					action={workspaceUrl("/calendar")}
					className="flex min-w-0 gap-2"
				>
					<input type="hidden" name="view" value={input.view} />
					<div className="relative min-w-0 flex-1 lg:w-64">
						<Icon
							icon={Search}
							className="pointer-events-none absolute top-2.5 left-2.5 text-muted-foreground"
						/>
						<Input
							name="search"
							defaultValue={input.search}
							placeholder="Search calendar"
							className="pl-9"
						/>
					</div>
					<Button type="submit">Search</Button>
				</form>
			</div>

			{!data.connection.connected ? (
				<div className="rounded-lg border bg-card p-3 text-sm">
					<span className="font-medium">Google Calendar is not connected.</span>{" "}
					<Link
						href={workspaceUrl("/settings/connections")}
						className="text-primary underline-offset-4 hover:underline"
					>
						Connect it in Settings → Connections
					</Link>{" "}
					to sync your events.
				</div>
			) : null}

			<div className="flex min-h-0 min-w-0 flex-1 gap-4">
				<div className="hidden min-h-0 overflow-y-auto md:block">
					<CalendarSidebar
						month={input.date}
						selectedDay={input.date}
						todayKey={todayKey}
						calendars={calendars}
						hiddenCalendars={hiddenCalendars}
						onToggleCalendar={toggleCalendar}
						dotClass={dotClass}
						hrefForDay={hrefForDay}
						hrefForMonth={hrefForMonth}
						connection={data.connection}
						settingsHref={workspaceUrl("/settings/connections")}
					/>
				</div>

				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					{input.view === "month" ? (
						<>
							<div className="hidden min-h-0 flex-1 flex-col md:flex">
								<CalendarMonthGrid
									month={input.date}
									events={events}
									todayKey={todayKey}
									toneClass={toneClass}
									onSelectEvent={setSelectedEvent}
									hrefForDay={hrefForDay}
								/>
							</div>
							<div className="flex min-h-0 flex-1 flex-col md:hidden">
								<CalendarSchedule
									fromDay={monthStartKey(input.date)}
									dayCount={monthDaysCount}
									events={events}
									todayKey={todayKey}
									toneClass={toneClass}
									onSelectEvent={setSelectedEvent}
								/>
							</div>
						</>
					) : null}

					{input.view === "week" ? (
						<>
							<div className="hidden min-h-0 flex-1 flex-col md:flex">
								<CalendarTimeGrid
									days={weekDays}
									events={events}
									todayKey={todayKey}
									toneClass={toneClass}
									onSelectEvent={setSelectedEvent}
									hrefForDay={hrefForDay}
								/>
							</div>
							<div className="flex min-h-0 flex-1 flex-col md:hidden">
								<CalendarSchedule
									fromDay={weekDays[0] ?? input.date}
									dayCount={7}
									events={events}
									todayKey={todayKey}
									toneClass={toneClass}
									onSelectEvent={setSelectedEvent}
								/>
							</div>
						</>
					) : null}

					{input.view === "day" ? (
						<CalendarTimeGrid
							days={[input.date]}
							events={events}
							todayKey={todayKey}
							toneClass={toneClass}
							onSelectEvent={setSelectedEvent}
							hrefForDay={hrefForDay}
						/>
					) : null}

					{input.view === "agenda" ? (
						<CalendarSchedule
							fromDay={input.date}
							dayCount={AGENDA_DAY_COUNT}
							events={events}
							todayKey={todayKey}
							toneClass={toneClass}
							onSelectEvent={setSelectedEvent}
						/>
					) : null}
				</div>
			</div>

			<CalendarEventDialog
				event={selectedEvent}
				onClose={() => setSelectedEvent(null)}
			/>
		</div>
	);
}

function heading(input: CalendarQueryInput): string {
	if (input.view === "month") return monthHeading(input.date);
	if (input.view === "week") return weekHeading(weekDayKeys(input.date));
	if (input.view === "agenda")
		return `${AGENDA_DAY_COUNT} days from ${input.date}`;
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(dayFromKey(input.date));
}

function monthStartKey(dayKey: string): string {
	const date = dayFromKey(dayKey);
	return localDayKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function daysInMonth(dayKey: string): number {
	const date = dayFromKey(dayKey);
	return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function calendarHref(input: CalendarQueryInput): string {
	const params = new URLSearchParams({
		view: input.view,
		date: input.date,
	});
	if (input.search.trim()) params.set("search", input.search.trim());
	return `/calendar?${params.toString()}`;
}

function stepDate(
	input: CalendarQueryInput,
	direction: -1 | 1,
): CalendarQueryInput {
	const days =
		input.view === "month"
			? null
			: input.view === "agenda"
				? AGENDA_DAY_COUNT
				: input.view === "week"
					? 7
					: 1;

	if (days !== null) {
		return { ...input, date: addDaysToKey(input.date, days * direction) };
	}

	const date = dayFromKey(input.date);
	return {
		...input,
		date: localDayKey(
			new Date(date.getFullYear(), date.getMonth() + direction, 1),
		),
	};
}
