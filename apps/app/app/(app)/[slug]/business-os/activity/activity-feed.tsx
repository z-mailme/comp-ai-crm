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
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Entry = RouterOutputs["businessOs"]["activityFeed"]["entries"][number];
type ActivityTypeFilter = Entry["type"] | "ALL";

const CELL = "px-3 py-2.5 align-middle";

const TYPE_LABELS = {
	ALL: "All",
	NOTE: "Notes",
	CALL: "Calls",
	EMAIL: "Emails",
	MEETING: "Meetings",
	TASK: "Tasks",
	STAGE_CHANGE: "Stage changes",
	ENRICHMENT: "Enrichment",
} satisfies Record<ActivityTypeFilter, string>;

const TYPE_ORDER: readonly ActivityTypeFilter[] = [
	"ALL",
	"NOTE",
	"CALL",
	"EMAIL",
	"MEETING",
	"TASK",
	"STAGE_CHANGE",
	"ENRICHMENT",
];

const COLUMNS: SimpleTableColumn[] = [
	{ id: "activity", header: "Activity" },
	{
		id: "linked",
		header: "Linked record",
		width: "w-56",
		className: "hidden md:table-cell",
	},
	{
		id: "author",
		header: "Author",
		width: "w-40",
		className: "hidden lg:table-cell",
	},
	{ id: "when", header: "When", width: "w-24", align: "right" },
];

export function ActivityFeed() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const [type, setType] = useState<ActivityTypeFilter>("ALL");

	const feed = useInfiniteQuery({
		...trpc.businessOs.activityFeed.infiniteQueryOptions(
			{ limit: 50, type: type === "ALL" ? undefined : type },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	});

	const entries = feed.data?.pages.flatMap((page) => page.entries) ?? [];

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Activity feed</CardTitle>
				<CardDescription>
					Newest first. Filter by type to narrow the feed.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<ToggleGroup
					type="single"
					value={type}
					onValueChange={(next) => {
						if (next) setType(next as ActivityTypeFilter);
					}}
					size="sm"
					spacing={0}
					className="flex-wrap"
				>
					{TYPE_ORDER.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{TYPE_LABELS[option]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{feed.isPending ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : entries.length === 0 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						No activity is recorded for this filter.
					</p>
				) : (
					<>
						<SimpleTable columns={COLUMNS}>
							{entries.map((entry) => (
								<ActivityRow
									key={entry.id}
									entry={entry}
									workspaceUrl={workspaceUrl}
								/>
							))}
						</SimpleTable>
						{feed.hasNextPage ? (
							<div className="flex justify-center">
								<Button
									variant="outline"
									size="sm"
									disabled={feed.isFetchingNextPage}
									onClick={() => void feed.fetchNextPage()}
								>
									{feed.isFetchingNextPage ? "Loading…" : "Load more"}
								</Button>
							</div>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function ActivityRow({
	entry,
	workspaceUrl,
}: {
	entry: Entry;
	workspaceUrl: (path: string) => string;
}) {
	const when = entry.occurredAt ?? entry.createdAt;

	return (
		<SimpleTableRow>
			<TableCell className={CELL}>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<Badge variant="outline">{TYPE_LABELS[entry.type]}</Badge>
						<span className="truncate font-medium">
							{entry.subject ?? <EmptyCellValue />}
						</span>
					</div>
					{entry.body ? (
						<span className="line-clamp-2 text-muted-foreground text-xs">
							{entry.body}
						</span>
					) : null}
				</div>
			</TableCell>
			<TableCell className={`${CELL} hidden md:table-cell`}>
				<LinkedRecord entry={entry} workspaceUrl={workspaceUrl} />
			</TableCell>
			<TableCell className={`${CELL} hidden lg:table-cell`}>
				{entry.author?.name ?? <EmptyCellValue />}
			</TableCell>
			<TableCell className={`${CELL} text-right`}>
				<LocalRelativeTime date={when} />
			</TableCell>
		</SimpleTableRow>
	);
}

function LinkedRecord({
	entry,
	workspaceUrl,
}: {
	entry: Entry;
	workspaceUrl: (path: string) => string;
}) {
	const links: { href: string; label: string }[] = [];

	if (entry.deal) {
		links.push({
			href: workspaceUrl(`/deals/${entry.deal.id}`),
			label: entry.deal.name,
		});
	}

	if (entry.company) {
		links.push({
			href: workspaceUrl(`/companies/${entry.company.id}`),
			label: entry.company.name,
		});
	}

	if (entry.contact) {
		links.push({
			href: workspaceUrl(`/contacts/${entry.contact.id}`),
			label: entry.contact.name,
		});
	}

	if (links.length === 0) return <EmptyCellValue />;

	return (
		<div className="flex flex-col gap-0.5">
			{links.map((link) => (
				<Link
					key={link.href}
					href={link.href}
					className="truncate text-xs hover:underline"
				>
					{link.label}
				</Link>
			))}
		</div>
	);
}
