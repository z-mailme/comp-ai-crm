"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardGrid, StatGroup } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
	LocalDateTime,
	LocalDateTimeRange,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const CELL = "px-3 py-2.5 align-middle";

const TASK_COLUMNS: SimpleTableColumn[] = [
	{ id: "task", header: "Task" },
	{
		id: "linked",
		header: "Linked record",
		width: "w-52",
		className: "hidden md:table-cell",
	},
	{ id: "due", header: "Due", width: "w-28", align: "right" },
];

const EVENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "event", header: "Meeting" },
	{ id: "when", header: "When", width: "w-44", align: "right" },
];

const BOOKING_COLUMNS: SimpleTableColumn[] = [
	{ id: "booking", header: "Booking" },
	{ id: "date", header: "Event date", width: "w-32" },
	{ id: "status", header: "Status", width: "w-28", align: "right" },
];

export function OperationsView() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();

	const overviewQuery = useQuery(trpc.businessOs.overview.queryOptions());
	const calendarQuery = useQuery(trpc.businessOs.calendar.queryOptions({}));
	const tasksQuery = useQuery(
		trpc.activities.myTasks.queryOptions({ window: "all", limit: 25 }),
	);
	const bookingsQuery = useQuery(
		trpc.businessOs.bookings.queryOptions({
			when: "upcoming",
			search: "",
			limit: 10,
		}),
	);

	const overview = overviewQuery.data;
	const calendar = calendarQuery.data;
	const tasks = tasksQuery.data;
	const bookings = bookingsQuery.data;

	if (!overview || !calendar || !tasks || !bookings) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const openTasks = tasks.filter((task) => !task.completedAt);

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="My open tasks"
					value={openTasks.length}
					description="Tasks assigned to you"
				/>
				<StatCard
					label="Waiting on us"
					value={overview.counts.waitingOnUs}
					description={`${overview.counts.openConversations} open conversations`}
				/>
				<StatCard
					label="Pending approvals"
					value={overview.counts.pendingApprovals}
					description="Agent actions that need a person"
				/>
				<StatCard
					label="Meetings this week"
					value={calendar.events.length}
					description={
						calendar.connection.connected
							? "From the connected Google Calendar"
							: "Calendar is not connected"
					}
				/>
			</StatGroup>

			<DashboardGrid columns={2}>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>My tasks</CardTitle>
						<CardDescription>
							Open tasks assigned to you, overdue first.
						</CardDescription>
					</CardHeader>
					{openTasks.length === 0 ? (
						<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
							No open tasks.
						</p>
					) : (
						<SimpleTable columns={TASK_COLUMNS}>
							{openTasks.map((task) => (
								<SimpleTableRow key={task.id}>
									<TableCell className={CELL}>
										<span className="truncate font-medium">
											{task.subject ?? <EmptyCellValue />}
										</span>
									</TableCell>
									<TableCell className={`${CELL} hidden md:table-cell`}>
										{task.deal ? (
											<Link
												href={workspaceUrl(`/deals/${task.deal.id}`)}
												className="truncate text-xs hover:underline"
											>
												{task.deal.name}
											</Link>
										) : task.company ? (
											<Link
												href={workspaceUrl(`/companies/${task.company.id}`)}
												className="truncate text-xs hover:underline"
											>
												{task.company.name}
											</Link>
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell className={`${CELL} text-right`}>
										{task.dueAt ? (
											<LocalRelativeTime date={task.dueAt} />
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Meetings this week</CardTitle>
						<CardDescription>
							{calendar.connection.connected
								? "Events from the connected Google Calendar."
								: "Connect Google in Settings → Connections to see meetings."}
						</CardDescription>
					</CardHeader>
					{calendar.events.length === 0 ? (
						<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
							No meetings this week.
						</p>
					) : (
						<SimpleTable columns={EVENT_COLUMNS}>
							{calendar.events.map((event) => (
								<SimpleTableRow key={event.id}>
									<TableCell className={CELL}>
										<div className="flex flex-col gap-0.5">
											<span className="truncate font-medium">
												{event.title ?? <EmptyCellValue />}
											</span>
											{event.company ? (
												<span className="truncate text-muted-foreground text-xs">
													{event.company.name}
												</span>
											) : null}
										</div>
									</TableCell>
									<TableCell className={`${CELL} text-right`}>
										{event.isAllDay ? (
											<LocalDateTime
												date={event.startsAt}
												options={{ month: "short", day: "numeric" }}
											/>
										) : (
											<LocalDateTimeRange
												start={event.startsAt}
												end={event.endsAt}
												options={{ hour: "numeric", minute: "2-digit" }}
											/>
										)}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</Card>
			</DashboardGrid>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Upcoming bookings</CardTitle>
					<CardDescription>
						Next confirmed and provisional bookings.
					</CardDescription>
				</CardHeader>
				{bookings.bookings.length === 0 ? (
					<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
						No upcoming bookings.
					</p>
				) : (
					<SimpleTable columns={BOOKING_COLUMNS}>
						{bookings.bookings.map((booking) => (
							<SimpleTableRow key={booking.id}>
								<TableCell className={CELL}>
									<Link
										href={workspaceUrl(`/deals/${booking.deal.id}`)}
										className="truncate font-medium hover:underline"
									>
										{booking.deal.name}
									</Link>
								</TableCell>
								<TableCell className={CELL}>
									<LocalDateTime
										date={booking.eventDate}
										options={{
											month: "short",
											day: "numeric",
											year: "numeric",
										}}
									/>
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									<StatusIndicator
										size="sm"
										tone={
											booking.status === "CONFIRMED"
												? "success"
												: booking.status === "CANCELLED"
													? "error"
													: "warning"
										}
										label={booking.status}
									/>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}
