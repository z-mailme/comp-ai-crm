"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Input } from "@crm/ui/components/input";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatMoney } from "@crm/ui/lib/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
	LocalDateTime,
	LocalDateTimeRange,
} from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Booking = RouterOutputs["businessOs"]["bookings"]["bookings"][number];
type When = "upcoming" | "past";

const CELL = "px-3 py-2.5 align-middle";

const STATUS_PRESENTATION = {
	PROVISIONAL: { label: "Provisional", tone: "warning" },
	HELD: { label: "Held", tone: "info" },
	CONFIRMED: { label: "Confirmed", tone: "success" },
	COMPLETED: { label: "Completed", tone: "neutral" },
	CANCELLED: { label: "Cancelled", tone: "error" },
} satisfies Record<Booking["status"], { label: string; tone: StatusTone }>;

const COLUMNS: SimpleTableColumn[] = [
	{ id: "booking", header: "Booking" },
	{ id: "status", header: "Status", width: "w-32" },
	{ id: "date", header: "Event date", width: "w-36" },
	{
		id: "time",
		header: "Time",
		width: "w-44",
		className: "hidden md:table-cell",
	},
	{
		id: "deal",
		header: "Deal",
		width: "w-56",
		className: "hidden lg:table-cell",
	},
	{ id: "value", header: "Value", width: "w-28", align: "right" },
];

export function BookingsBoard() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const [when, setWhen] = useState<When>("upcoming");
	const [search, setSearch] = useState("");

	const bookings = useInfiniteQuery({
		...trpc.businessOs.bookings.infiniteQueryOptions(
			{ when, search, limit: 50 },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	});

	const rows = bookings.data?.pages.flatMap((page) => page.bookings) ?? [];

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Bookings</CardTitle>
				<CardDescription>
					Bookings linked to deals in the active business unit.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<ToggleGroup
						type="single"
						value={when}
						onValueChange={(next) => {
							if (next) setWhen(next as When);
						}}
						size="sm"
						spacing={0}
					>
						<ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
						<ToggleGroupItem value="past">Past</ToggleGroupItem>
					</ToggleGroup>
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search booking, deal or company"
						className="h-8 w-64"
					/>
				</div>

				{bookings.isPending ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : rows.length === 0 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						No {when} bookings
						{search.trim() ? ` match “${search.trim()}”` : ""}.
					</p>
				) : (
					<>
						<SimpleTable columns={COLUMNS}>
							{rows.map((booking) => (
								<BookingRow
									key={booking.id}
									booking={booking}
									workspaceUrl={workspaceUrl}
								/>
							))}
						</SimpleTable>
						{bookings.hasNextPage ? (
							<div className="flex justify-center">
								<Button
									variant="outline"
									size="sm"
									disabled={bookings.isFetchingNextPage}
									onClick={() => void bookings.fetchNextPage()}
								>
									{bookings.isFetchingNextPage ? "Loading…" : "Load more"}
								</Button>
							</div>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function BookingRow({
	booking,
	workspaceUrl,
}: {
	booking: Booking;
	workspaceUrl: (path: string) => string;
}) {
	const status = STATUS_PRESENTATION[booking.status];

	return (
		<SimpleTableRow>
			<TableCell className={CELL}>
				<div className="flex flex-col gap-0.5">
					<Link
						href={workspaceUrl(`/deals/${booking.deal.id}`)}
						className="truncate font-medium hover:underline"
					>
						{booking.deal.name}
					</Link>
					<span className="text-muted-foreground text-xs">
						{booking.company?.name ?? booking.bookingKey}
					</span>
				</div>
			</TableCell>
			<TableCell className={CELL}>
				<StatusIndicator size="sm" tone={status.tone} label={status.label} />
			</TableCell>
			<TableCell className={CELL}>
				<LocalDateTime
					date={booking.eventDate}
					options={{ month: "short", day: "numeric", year: "numeric" }}
				/>
			</TableCell>
			<TableCell className={`${CELL} hidden md:table-cell`}>
				{booking.startsAt && booking.endsAt ? (
					<LocalDateTimeRange
						start={booking.startsAt}
						end={booking.endsAt}
						options={{ hour: "numeric", minute: "2-digit" }}
					/>
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
			<TableCell className={`${CELL} hidden lg:table-cell`}>
				{booking.conversationId ? (
					<Link
						href={workspaceUrl(`/inbox/${booking.conversationId}`)}
						className="text-xs hover:underline"
					>
						Open conversation
					</Link>
				) : (
					<Badge variant="outline">{booking.bookingKey}</Badge>
				)}
			</TableCell>
			<TableCell className={`${CELL} text-right tabular-nums`}>
				{booking.deal.amountCents != null ? (
					formatMoney(booking.deal.amountCents, booking.deal.currency)
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
		</SimpleTableRow>
	);
}
