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
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatCount } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";
const COLUMNS: SimpleTableColumn[] = [
	{ id: "approval", header: "Approval" },
	{ id: "risk", header: "Risk", width: "w-24" },
	{ id: "when", header: "Requested", width: "w-24", align: "right" },
];

export function PendingApprovalsWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const approvalsQuery = useQuery(trpc.businessOs.approvals.queryOptions({}));

	if (approvalsQuery.isPending) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Agent approvals</CardTitle>
					<CardDescription>
						Actions your agents want to take, waiting for you
					</CardDescription>
				</CardHeader>
				<div className="flex justify-center border-t py-10">
					<Spinner />
				</div>
			</Card>
		);
	}

	if (approvalsQuery.isError || !approvalsQuery.data) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Agent approvals</CardTitle>
					<CardDescription>
						{approvalsQuery.error?.message ??
							"Agent approvals are unavailable."}
					</CardDescription>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>No approvals available.</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	const pending = approvalsQuery.data.approvals
		.filter((approval) => approval.status === "PENDING")
		.slice(0, 6);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Agent approvals</CardTitle>
				<CardDescription>
					{pending.length === 0
						? "Nothing waits for your decision"
						: `${formatCount(pending.length, "action")} waiting for your decision`}
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={`/${slug}/command`}>Command centre</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				{pending.length === 0 ? (
					<CardPanelEmpty>No pending approvals.</CardPanelEmpty>
				) : (
					<SimpleTable variant="panel" surface="page" columns={COLUMNS}>
						{pending.map((approval) => (
							<SimpleTableRow key={approval.id}>
								<TableCell className={CELL}>
									<span className="flex min-w-0 flex-col">
										<span className="truncate font-medium">
											{approval.summary}
										</span>
										<span className="truncate text-muted-foreground">
											{approval.requestedByAgent?.name ?? "Agent"}
										</span>
									</span>
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={
											approval.riskLevel === "HIGH" ||
											approval.riskLevel === "CRITICAL"
												? "error"
												: approval.riskLevel === "MEDIUM"
													? "warning"
													: "neutral"
										}
										label={approval.riskLevel.toLowerCase()}
									/>
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									<LocalRelativeTime date={approval.createdAt} />
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</CardPanel>
		</Card>
	);
}
