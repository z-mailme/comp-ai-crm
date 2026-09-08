"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardGrid, StatGroup } from "@crm/ui/components/dashboard";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Row = {
	key: string;
	label: string;
	count: number;
	tone: StatusTone;
};

export function ObservabilityView() {
	const trpc = useTRPC();
	const observabilityQuery = useQuery(
		trpc.businessOs.observability.queryOptions(),
	);
	const observability = observabilityQuery.data;

	if (!observability) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const outboxRows: Row[] = [
		{
			key: "pending",
			label: "Pending",
			count: observability.outbox.pending,
			tone: "warning",
		},
		{
			key: "sending",
			label: "Sending",
			count: observability.outbox.sending,
			tone: "info",
		},
		{
			key: "sent",
			label: "Sent",
			count: observability.outbox.sent,
			tone: "success",
		},
		{
			key: "failed",
			label: "Failed",
			count: observability.outbox.failed,
			tone: "error",
		},
		{
			key: "cancelled",
			label: "Cancelled",
			count: observability.outbox.cancelled,
			tone: "neutral",
		},
	];
	const executionRows: Row[] = [
		{
			key: "queued",
			label: "Queued",
			count: observability.automationExecutions.queued,
			tone: "warning",
		},
		{
			key: "running",
			label: "Running",
			count: observability.automationExecutions.running,
			tone: "info",
		},
		{
			key: "waiting",
			label: "Waiting for approval",
			count: observability.automationExecutions.waitingForApproval,
			tone: "warning",
		},
		{
			key: "succeeded",
			label: "Succeeded",
			count: observability.automationExecutions.succeeded,
			tone: "success",
		},
		{
			key: "failed",
			label: "Failed",
			count: observability.automationExecutions.failed,
			tone: "error",
		},
		{
			key: "cancelled",
			label: "Cancelled",
			count: observability.automationExecutions.cancelled,
			tone: "neutral",
		},
	];
	const ruleRows: Row[] = [
		{
			key: "draft",
			label: "Draft",
			count: observability.automationRules.draft,
			tone: "neutral",
		},
		{
			key: "active",
			label: "Active",
			count: observability.automationRules.active,
			tone: "success",
		},
		{
			key: "paused",
			label: "Paused",
			count: observability.automationRules.paused,
			tone: "warning",
		},
		{
			key: "archived",
			label: "Archived",
			count: observability.automationRules.archived,
			tone: "neutral",
		},
	];
	const failedTotal =
		observability.outbox.failed + observability.automationExecutions.failed;

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Events waiting"
					value={observability.outbox.pending + observability.outbox.sending}
					description="Outbox rows not yet delivered"
				/>
				<StatCard
					label="Executions in flight"
					value={
						observability.automationExecutions.queued +
						observability.automationExecutions.running +
						observability.automationExecutions.waitingForApproval
					}
					description="Queued, running or waiting for approval"
				/>
				<StatCard
					label="Failed"
					value={failedTotal}
					description="Failed outbox rows and executions"
				/>
				<StatCard
					label="Active rules"
					value={observability.automationRules.active}
					description={`${observability.automationRules.paused} paused`}
				/>
			</StatGroup>

			<DashboardGrid columns={3}>
				<StatusCard
					title="Event outbox"
					description="Business events waiting for delivery to subscribers."
					rows={outboxRows}
				/>
				<StatusCard
					title="Automation executions"
					description="Runs of automation rules by current status."
					rows={executionRows}
				/>
				<StatusCard
					title="Automation rules"
					description="Configured rules by lifecycle status."
					rows={ruleRows}
				/>
			</DashboardGrid>
		</div>
	);
}

function StatusCard({
	title,
	description,
	rows,
}: {
	title: string;
	description: string;
	rows: Row[];
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<ul className="flex flex-col border-t px-5 py-1">
				{rows.map((row) => (
					<li
						key={row.key}
						className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0"
					>
						<StatusIndicator size="sm" tone={row.tone} label={row.label} />
						<span className="font-medium tabular-nums">{row.count}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}
