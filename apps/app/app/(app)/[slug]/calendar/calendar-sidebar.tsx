"use client";

import { Checkbox } from "@crm/ui/components/checkbox";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import {
	dayFromKey,
	dayNumber,
	monthGridDayKeys,
	weekdayLabel,
} from "./calendar-grid-model";
import type { CalendarListEntry } from "./calendar-workspace";

export function CalendarSidebar({
	month,
	selectedDay,
	todayKey,
	calendars,
	hiddenCalendars,
	onToggleCalendar,
	dotClass,
	hrefForDay,
	hrefForMonth,
	connection,
	settingsHref,
}: {
	month: string;
	selectedDay: string;
	todayKey: string;
	calendars: CalendarListEntry[];
	hiddenCalendars: ReadonlySet<string>;
	onToggleCalendar: (calendar: string, visible: boolean) => void;
	dotClass: (calendar: string) => string;
	hrefForDay: (dayKey: string) => string;
	hrefForMonth: (dayKey: string) => string;
	connection: {
		connected: boolean;
		status: string | null;
		lastSyncedAt: string | null;
		lastError: string | null;
	};
	settingsHref: string;
}) {
	return (
		<aside className="flex w-56 shrink-0 flex-col gap-4">
			<MiniMonth
				month={month}
				selectedDay={selectedDay}
				todayKey={todayKey}
				hrefForDay={hrefForDay}
				hrefForMonth={hrefForMonth}
			/>
			<div className="grid gap-2">
				<h2 className="font-medium text-sm">Calendars</h2>
				{calendars.length === 0 ? (
					<p className="text-muted-foreground text-xs">
						No calendar connected yet.
					</p>
				) : (
					calendars.map((calendar) => (
						<div key={calendar.id} className="flex items-center gap-2 text-sm">
							<Checkbox
								id={`calendar-visible-${calendar.id}`}
								checked={!hiddenCalendars.has(calendar.name)}
								onCheckedChange={(checked) =>
									onToggleCalendar(calendar.name, checked === true)
								}
								aria-label={`Show ${calendar.name}`}
							/>
							<span
								className={cn(
									"h-2.5 w-2.5 rounded-sm",
									dotClass(calendar.name),
								)}
							/>
							<label
								htmlFor={`calendar-visible-${calendar.id}`}
								className="truncate"
							>
								{calendar.name}
							</label>
						</div>
					))
				)}
			</div>
			<div className="grid gap-1 text-muted-foreground text-xs">
				<span>
					{connection.connected
						? (connection.status ?? "Connected")
						: "Google Calendar not connected"}
				</span>
				{connection.lastSyncedAt ? (
					<span>
						Last synced {new Date(connection.lastSyncedAt).toLocaleString()}
					</span>
				) : null}
				{connection.lastError ? (
					<span className="text-destructive">{connection.lastError}</span>
				) : null}
				<Link
					href={settingsHref}
					className="text-primary underline-offset-4 hover:underline"
				>
					Manage connection
				</Link>
			</div>
		</aside>
	);
}

function MiniMonth({
	month,
	selectedDay,
	todayKey,
	hrefForDay,
	hrefForMonth,
}: {
	month: string;
	selectedDay: string;
	todayKey: string;
	hrefForDay: (dayKey: string) => string;
	hrefForMonth: (dayKey: string) => string;
}) {
	const weeks = monthGridDayKeys(month);
	const heading = new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	}).format(dayFromKey(month));

	return (
		<div className="rounded-lg border bg-card p-2">
			<Link
				href={hrefForMonth(month)}
				className="mb-1 block px-1 font-medium text-sm hover:text-primary"
			>
				{heading}
			</Link>
			<div className="grid grid-cols-7 gap-0 text-center">
				{(weeks[0] ?? []).map((day) => (
					<span key={day} className="py-0.5 text-[10px] text-muted-foreground">
						{weekdayLabel(day).slice(0, 1)}
					</span>
				))}
				{weeks.flat().map((day) => {
					const inMonth =
						dayFromKey(day).getMonth() === dayFromKey(month).getMonth();
					return (
						<Link
							key={day}
							href={hrefForDay(day)}
							className={cn(
								"rounded-sm py-0.5 text-xs hover:bg-muted",
								!inMonth && "text-muted-foreground/60",
								day === selectedDay && "bg-muted font-medium",
								day === todayKey && "bg-primary text-primary-foreground",
							)}
							aria-current={day === selectedDay ? "date" : undefined}
						>
							{dayNumber(day)}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
