"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Search from "@carbon/icons-react/es/Search";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import {
	type CalendarQueryInput,
	type CalendarView,
	parseCalendarParams,
} from "./calendar-search-params";

type CalendarOutput = RouterOutputs["businessOs"]["calendar"];
type CalendarEvent = CalendarOutput["events"][number];

const VIEW_LABELS: Record<CalendarView, string> = {
	month: "Month",
	week: "Week",
	day: "Day",
	agenda: "Agenda",
};

export function CalendarWorkspace() {
	const trpc = useTRPC();
	const searchParams = useSearchParams();
	const workspaceUrl = useWorkspaceUrl();
	const input = parseCalendarParams(searchParams);
	const calendar = useQuery(trpc.businessOs.calendar.queryOptions(input));

	const data = calendar.data;

	if (!data || calendar.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const attendeeCount = data.events.reduce(
		(total, event) => total + event.attendees.length,
		0,
	);
	const linkedEvents = data.events.filter(
		(event) => event.contact || event.company || event.booking || event.deal,
	).length;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-wrap items-center gap-2">
					<Button asChild variant="outline" size="icon" aria-label="Previous">
						<Link href={workspaceUrl(calendarHref(stepDate(input, -1)))}>
							<Icon icon={ArrowLeft} />
						</Link>
					</Button>
					<input
						type="date"
						name="date"
						defaultValue={input.date}
						form="calendar-filter"
						className="h-9 rounded-md border bg-background px-3 text-sm"
					/>
					<Button asChild variant="outline" size="icon" aria-label="Next">
						<Link href={workspaceUrl(calendarHref(stepDate(input, 1)))}>
							<Icon icon={ArrowRight} />
						</Link>
					</Button>
					<fieldset className="flex overflow-hidden rounded-md border">
						<legend className="sr-only">Calendar view</legend>
						{Object.entries(VIEW_LABELS).map(([view, label]) => (
							<Link
								key={view}
								href={workspaceUrl(
									calendarHref({ ...input, view: view as CalendarView }),
								)}
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
					<div className="relative min-w-0 flex-1 md:w-72">
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

			<StatGroup>
				<StatCard
					label="Events"
					value={data.events.length}
					description={rangeLabel(data.range)}
				/>
				<StatCard
					label="Linked"
					value={linkedEvents}
					description="Events with CRM context"
				/>
				<StatCard
					label="Attendees"
					value={attendeeCount}
					description="Stored attendee rows"
				/>
				<StatCard
					label="Google"
					value={data.connection.connected ? "On" : "Off"}
					description={data.connection.status ?? "No sync row"}
				/>
			</StatGroup>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Meetings</CardTitle>
					<CardDescription>
						{data.connection.lastSyncedAt
							? `Last synced ${new Date(data.connection.lastSyncedAt).toLocaleString()}`
							: "Calendar sync has no completed run yet."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{data.events.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No calendar events match this view.
						</p>
					) : (
						data.events.map((event) => (
							<CalendarEventRow key={event.id} event={event} />
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function CalendarEventRow({ event }: { event: CalendarEvent }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<article className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="truncate font-medium">
						{event.title ?? "Untitled event"}
					</h2>
					<Badge variant="outline">{event.status}</Badge>
					{event.isAllDay ? <Badge variant="secondary">All day</Badge> : null}
				</div>
				<p className="mt-1 text-muted-foreground text-sm">
					<LocalDateTimeRange
						start={event.startsAt}
						end={event.endsAt}
						options={{
							month: "short",
							day: "numeric",
							hour: "numeric",
							minute: "2-digit",
						}}
					/>
				</p>
				<div className="mt-3 flex flex-wrap gap-2 text-xs">
					<EntityBadge
						label="Contact"
						value={event.contact?.name}
						href={
							event.contact
								? workspaceUrl(`/contacts/${event.contact.id}`)
								: undefined
						}
					/>
					<EntityBadge
						label="Company"
						value={event.company?.name}
						href={
							event.company
								? workspaceUrl(`/companies/${event.company.id}`)
								: undefined
						}
					/>
					<EntityBadge label="Booking" value={event.booking?.name} />
					<EntityBadge
						label="Deal"
						value={event.deal?.name}
						href={
							event.deal ? workspaceUrl(`/deals/${event.deal.id}`) : undefined
						}
					/>
					<EntityBadge label="Conversation" value={event.conversation?.name} />
				</div>
				{event.contact ||
				event.company ||
				event.booking ||
				event.deal ? null : (
					<p className="mt-3 text-muted-foreground text-xs">
						Not linked to CRM.
					</p>
				)}
				{event.location || event.conferenceUrl ? (
					<p className="mt-3 truncate text-muted-foreground text-sm">
						{event.location ?? event.conferenceUrl}
					</p>
				) : null}
			</div>
			<div className="flex flex-col gap-2 md:w-64">
				<StatusIndicator
					tone={eventTone(event)}
					label={`${event.attendees.length} attendee${
						event.attendees.length === 1 ? "" : "s"
					}`}
				/>
				<div className="flex flex-col gap-1 text-xs">
					{event.attendees.slice(0, 4).map((attendee) => (
						<div
							key={attendee.id}
							className="flex min-w-0 items-center justify-between gap-2"
						>
							<span className="truncate">
								{attendee.name ?? attendee.email}
							</span>
							<span className="shrink-0 text-muted-foreground">
								{attendee.responseStatus ?? <EmptyCellValue />}
							</span>
						</div>
					))}
				</div>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="outline" size="sm">
							Details
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-lg">
						<DialogHeader>
							<DialogTitle>{event.title ?? "Untitled event"}</DialogTitle>
							<DialogDescription>
								{event.sourceCalendar} - {event.status}
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 text-sm">
							<div className="grid gap-1">
								<span className="font-medium">Time</span>
								<span className="text-muted-foreground">
									<LocalDateTimeRange
										start={event.startsAt}
										end={event.endsAt}
										options={{
											month: "short",
											day: "numeric",
											year: "numeric",
											hour: "numeric",
											minute: "2-digit",
										}}
									/>
								</span>
							</div>
							<div className="grid gap-1">
								<span className="font-medium">Calendar</span>
								<span className="text-muted-foreground">
									{event.organizerEmail ?? "No organizer"}
								</span>
							</div>
							{event.location ? (
								<div className="grid gap-1">
									<span className="font-medium">Location</span>
									<span className="text-muted-foreground">
										{event.location}
									</span>
								</div>
							) : null}
							{event.conferenceUrl ? (
								<div className="grid gap-1">
									<span className="font-medium">Conference</span>
									<a
										href={event.conferenceUrl}
										target="_blank"
										rel="noreferrer"
										className="truncate text-primary underline-offset-4 hover:underline"
									>
										{event.conferenceUrl}
									</a>
								</div>
							) : null}
							<div className="grid gap-2">
								<span className="font-medium">CRM links</span>
								{event.contact ||
								event.company ||
								event.booking ||
								event.deal ||
								event.conversation ? (
									<div className="flex flex-wrap gap-2 text-xs">
										<EntityBadge
											label="Contact"
											value={event.contact?.name}
											href={
												event.contact
													? workspaceUrl(`/contacts/${event.contact.id}`)
													: undefined
											}
										/>
										<EntityBadge
											label="Company"
											value={event.company?.name}
											href={
												event.company
													? workspaceUrl(`/companies/${event.company.id}`)
													: undefined
											}
										/>
										<EntityBadge label="Booking" value={event.booking?.name} />
										<EntityBadge
											label="Deal"
											value={event.deal?.name}
											href={
												event.deal
													? workspaceUrl(`/deals/${event.deal.id}`)
													: undefined
											}
										/>
										<EntityBadge
											label="Conversation"
											value={event.conversation?.name}
										/>
									</div>
								) : (
									<span className="text-muted-foreground">
										Not linked to CRM.
									</span>
								)}
							</div>
							<div className="grid gap-2">
								<span className="font-medium">Attendees</span>
								{event.attendees.length === 0 ? (
									<span className="text-muted-foreground">No attendees</span>
								) : (
									<div className="grid gap-2">
										{event.attendees.map((attendee) => (
											<div
												key={attendee.id}
												className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
											>
												<span className="truncate">
													{attendee.name ?? attendee.email}
												</span>
												<span className="shrink-0 text-muted-foreground">
													{attendee.responseStatus ?? "Unknown"}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</article>
	);
}

function EntityBadge({
	label,
	value,
	href,
}: {
	label: string;
	value: string | null | undefined;
	href?: string;
}) {
	if (!value) return null;

	const content = `${label}: ${value}`;
	const className = "rounded-md bg-muted px-2 py-1 text-muted-foreground";

	return href ? (
		<Link href={href} className={cn(className, "hover:text-foreground")}>
			{content}
		</Link>
	) : (
		<span className={className}>{content}</span>
	);
}

function eventTone(event: CalendarEvent): StatusTone {
	if (event.booking || event.deal) return "success";
	if (event.contact || event.company) return "info";
	return "neutral";
}

function rangeLabel(range: CalendarOutput["range"]): string {
	const start = new Date(range.start);
	const end = new Date(range.end);
	return `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
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
	const date = new Date(`${input.date}T00:00:00.000Z`);
	const amount =
		input.view === "month"
			? 31
			: input.view === "agenda"
				? 30
				: input.view === "week"
					? 7
					: 1;
	date.setUTCDate(date.getUTCDate() + amount * direction);
	return { ...input, date: date.toISOString().slice(0, 10) };
}
