"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";
const COLUMNS: SimpleTableColumn[] = [
	{ id: "when", header: "When", width: "w-36" },
	{ id: "event", header: "Event" },
	{
		id: "where",
		header: "Where",
		width: "w-40",
		className: "hidden md:table-cell",
	},
];

export function UpcomingEventsWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const calendarQuery = useQuery(
		trpc.businessOs.calendar.queryOptions({ view: "agenda" }),
	);

	if (calendarQuery.isPending) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Upcoming events</CardTitle>
					<CardDescription>The next events on your calendar</CardDescription>
				</CardHeader>
				<div className="flex justify-center border-t py-10">
					<Spinner />
				</div>
			</Card>
		);
	}

	const calendar = calendarQuery.data;
	const calendarHref = `/${slug}/calendar`;

	if (calendarQuery.isError || !calendar) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Upcoming events</CardTitle>
					<CardDescription>
						{calendarQuery.error?.message ?? "Calendar data is unavailable."}
					</CardDescription>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>No events available.</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	if (!calendar.connection.connected) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Upcoming events</CardTitle>
					<CardDescription>
						Setup required. Connect Google Calendar to see events here.
					</CardDescription>
					<CardAction>
						<Button asChild variant="outline" size="sm">
							<Link href={`/${slug}/settings/connections/google`}>Connect</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>No calendar connected.</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	const upcoming = calendar.events
		.filter((event) => event.status !== "cancelled")
		.slice(0, 8);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Upcoming events</CardTitle>
				<CardDescription>The next events on your calendar</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={calendarHref}>Open calendar</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				{upcoming.length === 0 ? (
					<CardPanelEmpty>No upcoming events.</CardPanelEmpty>
				) : (
					<SimpleTable variant="panel" surface="page" columns={COLUMNS}>
						{upcoming.map((event) => (
							<SimpleTableRow key={event.id}>
								<TableCell className={CELL}>
									{event.isAllDay ? (
										<span className="text-muted-foreground">
											{new Date(event.startsAt).toLocaleDateString(undefined, {
												month: "short",
												day: "numeric",
											})}{" "}
											· all day
										</span>
									) : (
										<span className="tabular-nums">
											{new Date(event.startsAt).toLocaleDateString(undefined, {
												month: "short",
												day: "numeric",
											})}{" "}
											{new Date(event.startsAt).toLocaleTimeString(undefined, {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									)}
								</TableCell>
								<TableCell className={`${CELL} font-medium`}>
									<span className="truncate">
										{event.title ?? "Untitled event"}
									</span>
								</TableCell>
								<TableCell
									className={`${CELL} hidden text-muted-foreground md:table-cell`}
								>
									<span className="truncate">{event.location ?? "—"}</span>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</CardPanel>
		</Card>
	);
}
