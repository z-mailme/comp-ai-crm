"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { cn } from "@crm/ui/lib/utils";
import {
	CALENDAR_EVENT_COLORS,
	type CalendarEventColorId,
} from "@crm/validation/calendar-event-colors";
import Link from "next/link";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { colorSwatchStyle } from "./calendar-event-colors";
import type { CalendarEvent } from "./calendar-workspace";

export function CalendarEventDialog({
	event,
	onClose,
	colorPending = false,
	onSelectColor,
}: {
	event: CalendarEvent | null;
	onClose: () => void;
	colorPending?: boolean;
	onSelectColor?: (color: CalendarEventColorId | null) => void;
}) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				{event ? (
					<>
						<DialogHeader>
							<DialogTitle>{event.title ?? "Untitled event"}</DialogTitle>
							<DialogDescription>
								{event.sourceCalendar} · {event.status}
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
											weekday: "short",
											month: "short",
											day: "numeric",
											year: "numeric",
											hour: event.isAllDay ? undefined : "numeric",
											minute: event.isAllDay ? undefined : "2-digit",
										}}
									/>
									{event.isAllDay ? " · All day" : null}
								</span>
							</div>
							{event.organizerEmail ? (
								<div className="grid gap-1">
									<span className="font-medium">Organiser</span>
									<span className="text-muted-foreground">
										{event.organizerEmail}
									</span>
								</div>
							) : null}
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
									<span className="font-medium">Meeting link</span>
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
							{event.description ? (
								<div className="grid gap-1">
									<span className="font-medium">Description</span>
									<p className="whitespace-pre-wrap text-muted-foreground">
										{event.description}
									</p>
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
								<span className="font-medium">
									Attendees ({event.attendees.length})
								</span>
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
													{attendee.isOrganizer ? " · organiser" : ""}
												</span>
												<span className="shrink-0 text-muted-foreground">
													{attendee.responseStatus ?? "Unknown"}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
							<div className="grid gap-2">
								<span className="font-medium">Colour</span>
								<div className="flex flex-wrap items-center gap-1.5">
									<button
										type="button"
										disabled={colorPending || !onSelectColor}
										onClick={() => onSelectColor?.(null)}
										aria-pressed={event.colorOverride === null}
										className={cn(
											"rounded-md border px-2 py-1 text-xs hover:bg-muted",
											event.colorOverride === null &&
												"border-primary font-medium",
										)}
									>
										Calendar default
									</button>
									{CALENDAR_EVENT_COLORS.map((color) => (
										<button
											key={color.id}
											type="button"
											disabled={colorPending || !onSelectColor}
											onClick={() => onSelectColor?.(color.id)}
											aria-label={`Colour ${color.label}`}
											aria-pressed={event.colorOverride === color.id}
											title={color.label}
											className={cn(
												"h-6 w-6 rounded-md border",
												event.colorOverride === color.id
													? "border-foreground ring-1 ring-ring"
													: "border-transparent",
											)}
											style={colorSwatchStyle(color.id)}
										/>
									))}
								</div>
								<span className="text-muted-foreground text-xs">
									Stored in Comp AI only — Google Calendar is not modified.
								</span>
							</div>
							<p className="text-muted-foreground text-xs">
								Read-only — the connected Google account has calendar read
								access. Edit this event in Google Calendar.
							</p>
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
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
		<Link href={href} className={`${className} hover:text-foreground`}>
			{content}
		</Link>
	) : (
		<span className={className}>{content}</span>
	);
}
