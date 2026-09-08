"use client";

import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardContent,
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
import { formatCount } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Overview = RouterOutputs["businessOs"]["overview"];
type Observability = RouterOutputs["businessOs"]["observability"];
type Knowledge = RouterOutputs["businessOs"]["knowledge"];

const CELL = "px-3 py-2.5 align-middle";

const CONVERSATION_COLUMNS: SimpleTableColumn[] = [
	{ id: "conversation", header: "Conversation" },
	{
		id: "customer",
		header: "Customer",
		width: "w-52",
		className: "hidden md:table-cell",
	},
	{ id: "status", header: "Status", width: "w-36" },
	{ id: "when", header: "When", width: "w-20", align: "right" },
];

const EVENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "event", header: "Event" },
	{ id: "source", header: "Source", width: "w-28" },
	{ id: "when", header: "When", width: "w-20", align: "right" },
];

export function CommandCentre() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();

	const overviewQuery = useQuery(trpc.businessOs.overview.queryOptions());
	const observabilityQuery = useQuery(
		trpc.businessOs.observability.queryOptions(),
	);
	const knowledgeQuery = useQuery(trpc.businessOs.knowledge.queryOptions());

	const overview = overviewQuery.data;
	const observability = observabilityQuery.data;
	const knowledge = knowledgeQuery.data;

	if (!overview || !observability || !knowledge) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Open conversations"
					value={overview.counts.openConversations}
					description={`${overview.counts.waitingOnUs} waiting on us`}
				/>
				<StatCard
					label="Pending approvals"
					value={overview.counts.pendingApprovals}
					description="Agent actions that need a person"
				/>
				<StatCard
					label="Open tasks"
					value={overview.counts.openTasks}
					description="Human and agent work queue"
				/>
				<StatCard
					label="Events today"
					value={overview.counts.recentEvents}
					description="BusinessEvent rows in the last 24 hours"
				/>
			</StatGroup>

			<DashboardGrid columns={3}>
				<SystemCard overview={overview} observability={observability} />
				<KnowledgeCard knowledge={knowledge} />
				<ApprovalsCard overview={overview} />
			</DashboardGrid>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Recent conversations</CardTitle>
					<CardDescription>
						Unified communication threads across connected channels.
					</CardDescription>
				</CardHeader>
				<ConversationTable conversations={overview.recentConversations} />
			</Card>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Recent events</CardTitle>
					<CardDescription>
						The append-only backbone that agents and automations read.
					</CardDescription>
				</CardHeader>
				<EventTable events={overview.recentEvents} />
			</Card>

			<Link
				href={workspaceUrl("/inbox")}
				className="text-muted-foreground text-sm underline-offset-2 hover:underline"
			>
				Open Unified Inbox
			</Link>
		</div>
	);
}

function SystemCard({
	overview,
	observability,
}: {
	overview: Overview;
	observability: Observability;
}) {
	return (
		<CardContent>
			<CardTitle>Safety and flow</CardTitle>
			<div className="flex flex-col gap-3 text-sm">
				<StatusIndicator
					tone={overview.killSwitch ? "error" : "success"}
					label={
						overview.killSwitch ? "Automation stopped" : "Automation available"
					}
				/>
				<SystemLine
					label="Outbox pending"
					value={observability.outbox.pending}
				/>
				<SystemLine label="Outbox failed" value={observability.outbox.failed} />
				<SystemLine
					label="Runs waiting"
					value={observability.automationExecutions.waitingForApproval}
				/>
			</div>
		</CardContent>
	);
}

function KnowledgeCard({ knowledge }: { knowledge: Knowledge }) {
	return (
		<CardContent>
			<CardTitle>Knowledge and rules</CardTitle>
			<div className="flex flex-col gap-3 text-sm">
				<SystemLine
					label="Knowledge items"
					value={formatCount(knowledge.items.length, "item")}
				/>
				<SystemLine
					label="Active rules"
					value={knowledge.rules.filter((rule) => rule.active).length}
				/>
				<SystemLine
					label="Draft rules"
					value={knowledge.rules.filter((rule) => !rule.active).length}
				/>
			</div>
		</CardContent>
	);
}

function ApprovalsCard({ overview }: { overview: Overview }) {
	return (
		<CardContent>
			<CardTitle>Approvals</CardTitle>
			<div className="flex flex-col gap-3">
				{overview.pendingApprovals.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No agent action waits for approval.
					</p>
				) : (
					overview.pendingApprovals.slice(0, 4).map((approval) => (
						<div key={approval.id} className="flex min-w-0 flex-col gap-1">
							<span className="truncate text-sm">{approval.summary}</span>
							<span className="text-muted-foreground text-xs">
								{approval.riskLevel} risk
							</span>
						</div>
					))
				)}
			</div>
		</CardContent>
	);
}

function ConversationTable({
	conversations,
}: {
	conversations: Overview["recentConversations"];
}) {
	if (conversations.length === 0) {
		return (
			<CardContent>
				<p className="text-muted-foreground text-sm">
					No unified conversations are stored yet.
				</p>
			</CardContent>
		);
	}

	return (
		<SimpleTable columns={CONVERSATION_COLUMNS}>
			{conversations.map((conversation) => (
				<SimpleTableRow key={conversation.id}>
					<TableCell className={CELL}>
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-medium">
								{conversation.subject ?? "Conversation"}
							</span>
							<span className="truncate text-muted-foreground text-xs">
								{conversation.preview ?? <EmptyCellValue />}
							</span>
						</div>
					</TableCell>
					<TableCell className={`${CELL} hidden md:table-cell`}>
						{conversation.contact?.name ?? conversation.company?.name ?? (
							<EmptyCellValue />
						)}
					</TableCell>
					<TableCell className={CELL}>
						<Badge variant="secondary">{conversation.status}</Badge>
					</TableCell>
					<TableCell className={`${CELL} text-right text-muted-foreground`}>
						{conversation.lastMessageAt ? (
							<LocalRelativeTime date={conversation.lastMessageAt} />
						) : (
							<EmptyCellValue />
						)}
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}

function EventTable({ events }: { events: Overview["recentEvents"] }) {
	if (events.length === 0) {
		return (
			<CardContent>
				<p className="text-muted-foreground text-sm">
					No BusinessEvent rows are stored yet.
				</p>
			</CardContent>
		);
	}

	return (
		<SimpleTable columns={EVENT_COLUMNS}>
			{events.map((event) => (
				<SimpleTableRow key={event.id}>
					<TableCell className={CELL}>
						<span className="truncate font-medium">{event.type}</span>
					</TableCell>
					<TableCell className={CELL}>
						<Badge variant="outline">{event.source}</Badge>
					</TableCell>
					<TableCell className={`${CELL} text-right text-muted-foreground`}>
						<LocalRelativeTime date={event.occurredAt} />
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}

function SystemLine({
	label,
	value,
}: {
	label: string;
	value: number | string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}
