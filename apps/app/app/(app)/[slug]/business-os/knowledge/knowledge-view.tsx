"use client";

import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
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
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const ITEM_COLUMNS: SimpleTableColumn[] = [
	{ id: "title", header: "Knowledge item" },
	{ id: "type", header: "Type", width: "w-36" },
	{ id: "status", header: "Status", width: "w-32" },
	{ id: "versions", header: "Versions", width: "w-28", align: "right" },
	{
		id: "confidence",
		header: "Confidence",
		width: "w-28",
		align: "right",
		className: "hidden md:table-cell",
	},
];

const RULE_COLUMNS: SimpleTableColumn[] = [
	{ id: "title", header: "Rule" },
	{ id: "type", header: "Type", width: "w-36" },
	{ id: "priority", header: "Priority", width: "w-24", align: "right" },
	{ id: "status", header: "Status", width: "w-32" },
];

export function KnowledgeView() {
	const trpc = useTRPC();
	const knowledgeQuery = useQuery(trpc.businessOs.knowledge.queryOptions());
	const knowledge = knowledgeQuery.data;

	if (!knowledge) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const activeItems = knowledge.items.filter((item) => item.active).length;
	const activeRules = knowledge.rules.filter((rule) => rule.active).length;

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Active knowledge items"
					value={activeItems}
					description={`${knowledge.items.length} items in total`}
				/>
				<StatCard
					label="Active rules"
					value={activeRules}
					description={`${knowledge.rules.length} rules in total`}
				/>
			</StatGroup>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Knowledge items</CardTitle>
					<CardDescription>
						Approved material agents ground their answers on.
					</CardDescription>
				</CardHeader>
				{knowledge.items.length === 0 ? (
					<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
						No knowledge items are stored.
					</p>
				) : (
					<SimpleTable columns={ITEM_COLUMNS}>
						{knowledge.items.map((item) => (
							<SimpleTableRow key={item.id}>
								<TableCell className={CELL}>
									<div className="flex flex-col gap-0.5">
										<span className="truncate font-medium">{item.title}</span>
										{item.source ? (
											<span className="truncate text-muted-foreground text-xs">
												{item.source}
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell className={CELL}>
									<Badge variant="outline">{item.type}</Badge>
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={item.active ? "success" : "neutral"}
										label={item.active ? "Active" : "Inactive"}
									/>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{item.versions}
									{item.activeVersion != null
										? ` · v${item.activeVersion}`
										: ""}
								</TableCell>
								<TableCell
									className={`${CELL} hidden text-right tabular-nums md:table-cell`}
								>
									{item.confidence != null
										? `${Math.round(item.confidence * 100)}%`
										: "—"}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Business rules</CardTitle>
					<CardDescription>
						Rules that steer agent behaviour, ordered by priority.
					</CardDescription>
				</CardHeader>
				{knowledge.rules.length === 0 ? (
					<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
						No business rules are stored.
					</p>
				) : (
					<SimpleTable columns={RULE_COLUMNS}>
						{knowledge.rules.map((rule) => (
							<SimpleTableRow key={rule.id}>
								<TableCell className={CELL}>
									<span className="truncate font-medium">{rule.title}</span>
								</TableCell>
								<TableCell className={CELL}>
									<Badge variant="outline">{rule.type}</Badge>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{rule.priority}
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={rule.active ? "success" : "neutral"}
										label={rule.active ? "Active" : "Inactive"}
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
