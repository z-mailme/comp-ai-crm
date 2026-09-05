"use client";

import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Conversation =
	RouterOutputs["businessOs"]["inbox"]["conversations"][number];

const CELL = "px-3 py-2.5 align-middle";

const COLUMNS: SimpleTableColumn[] = [
	{ id: "conversation", header: "Conversation" },
	{
		id: "customer",
		header: "Customer",
		width: "w-56",
		className: "hidden md:table-cell",
	},
	{ id: "channel", header: "Channel", width: "w-28" },
	{
		id: "owner",
		header: "Owner",
		width: "w-40",
		className: "hidden lg:table-cell",
	},
	{ id: "status", header: "Status", width: "w-36" },
	{ id: "when", header: "When", width: "w-20", align: "right" },
];

export function UnifiedInbox() {
	const trpc = useTRPC();

	const inboxQuery = useQuery(
		trpc.businessOs.inbox.queryOptions({ limit: 50 }),
	);
	const overviewQuery = useQuery(trpc.businessOs.overview.queryOptions());

	const conversations = inboxQuery.data?.conversations ?? [];
	const overview = overviewQuery.data;

	if (!overview || inboxQuery.isPending) {
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
					label="Open"
					value={overview.counts.openConversations}
					description="Active customer conversations"
				/>
				<StatCard
					label="Waiting on us"
					value={overview.counts.waitingOnUs}
					description="Needs a workspace response"
				/>
				<StatCard
					label="Needs review"
					value={overview.counts.needsReview}
					description="Conversation insights flagged"
				/>
				<StatCard
					label="Approvals"
					value={overview.counts.pendingApprovals}
					description="Agent actions waiting"
				/>
			</StatGroup>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Conversations</CardTitle>
					<CardDescription>
						Email threads now project into the unified conversation table.
					</CardDescription>
				</CardHeader>
				{conversations.length === 0 ? (
					<CardContent>
						<p className="text-muted-foreground text-sm">
							No unified conversations are stored yet.
						</p>
					</CardContent>
				) : (
					<SimpleTable columns={COLUMNS}>
						{conversations.map((conversation) => (
							<ConversationRow
								key={conversation.id}
								conversation={conversation}
							/>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
	const customer =
		conversation.contact?.name ??
		conversation.company?.name ??
		conversation.deal?.name ??
		null;

	return (
		<SimpleTableRow>
			<TableCell className={CELL}>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="truncate font-medium">
						{conversation.subject ?? "Conversation"}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{conversation.preview ?? <EmptyCellValue />}
					</span>
				</div>
			</TableCell>
			<TableCell className={`${CELL} hidden md:table-cell`}>
				{customer ?? <EmptyCellValue />}
			</TableCell>
			<TableCell className={CELL}>
				<Badge variant="outline">{conversation.channel}</Badge>
			</TableCell>
			<TableCell className={`${CELL} hidden lg:table-cell`}>
				{conversation.assignedOwner?.name ??
					conversation.assignedAgent?.name ?? <EmptyCellValue />}
			</TableCell>
			<TableCell className={CELL}>
				<StatusIndicator
					tone={statusTone(conversation.status)}
					label={conversation.status}
				/>
			</TableCell>
			<TableCell className={`${CELL} text-right text-muted-foreground`}>
				{conversation.lastMessageAt ? (
					<LocalRelativeTime date={conversation.lastMessageAt} />
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
		</SimpleTableRow>
	);
}

function statusTone(status: string): StatusTone {
	switch (status) {
		case "OPEN":
			return "info";
		case "WAITING_ON_US":
			return "warning";
		case "RESOLVED":
			return "success";
		case "ARCHIVED":
			return "neutral";
		default:
			return "primary";
	}
}
