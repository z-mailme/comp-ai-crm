"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney, formatPercent } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { LocalDateTime } from "@/components/local-date-time";
import { dealStageLabel } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const STAGE_COLUMNS: SimpleTableColumn[] = [
	{ id: "stage", header: "Stage" },
	{ id: "count", header: "Deals", width: "w-24", align: "right" },
	{ id: "value", header: "Value", width: "w-32", align: "right" },
];

const OUTCOME_COLUMNS: SimpleTableColumn[] = [
	{ id: "outcome", header: "Outcome · last 90 days" },
	{ id: "count", header: "Deals", width: "w-24", align: "right" },
	{ id: "value", header: "Value", width: "w-32", align: "right" },
];

const WEEK_COLUMNS: SimpleTableColumn[] = [
	{ id: "week", header: "Week starting" },
	{ id: "deals", header: "New deals", width: "w-28", align: "right" },
	{ id: "activities", header: "Activities", width: "w-28", align: "right" },
];

export function ReportsView() {
	const trpc = useTRPC();
	const analyticsQuery = useQuery(trpc.businessOs.analytics.queryOptions());
	const analytics = analyticsQuery.data;

	if (!analytics) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const money = (cents: number) =>
		formatMoney(cents, analytics.reportingCurrency);

	return (
		<div className="flex flex-col gap-6">
			<p className="text-muted-foreground text-xs">
				Generated <LocalDateTime date={analytics.generatedAt} options={{}} /> ·
				values in {analytics.reportingCurrency}.
			</p>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Open pipeline by stage</CardTitle>
					<CardDescription>
						{analytics.pipeline.openCount} open deals ·{" "}
						{money(analytics.pipeline.openBaseValueCents)} converted value.
					</CardDescription>
				</CardHeader>
				<SimpleTable columns={STAGE_COLUMNS}>
					{analytics.pipeline.stages.map((stage) => (
						<SimpleTableRow key={stage.stage}>
							<TableCell className={CELL}>
								{dealStageLabel(stage.stage)}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{stage.count}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{money(stage.baseValueCents)}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
				{analytics.pipeline.unconvertedOpen.count > 0 ? (
					<p className="border-t px-5 py-3 text-muted-foreground text-xs">
						{analytics.pipeline.unconvertedOpen.count} open deals in{" "}
						{analytics.pipeline.unconvertedOpen.currencies.join(", ")} have no
						exchange rate and are outside the value column.
					</p>
				) : null}
			</Card>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Outcomes</CardTitle>
					<CardDescription>
						Decided deals in the last 90 days. Win rate{" "}
						{analytics.outcomes90d.winRate != null
							? formatPercent(analytics.outcomes90d.winRate)
							: "is unavailable until a deal is decided"}
						.
					</CardDescription>
				</CardHeader>
				<SimpleTable columns={OUTCOME_COLUMNS}>
					<SimpleTableRow>
						<TableCell className={CELL}>Won</TableCell>
						<TableCell className={`${CELL} text-right tabular-nums`}>
							{analytics.outcomes90d.wonCount}
						</TableCell>
						<TableCell className={`${CELL} text-right tabular-nums`}>
							{money(analytics.outcomes90d.wonBaseValueCents)}
						</TableCell>
					</SimpleTableRow>
					<SimpleTableRow>
						<TableCell className={CELL}>Lost or unqualified</TableCell>
						<TableCell className={`${CELL} text-right tabular-nums`}>
							{analytics.outcomes90d.lostCount}
						</TableCell>
						<TableCell className={`${CELL} text-right tabular-nums`}>
							{money(analytics.outcomes90d.lostBaseValueCents)}
						</TableCell>
					</SimpleTableRow>
				</SimpleTable>
			</Card>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Weekly activity</CardTitle>
					<CardDescription>
						New deals and recorded activities per week, last 12 weeks.
					</CardDescription>
				</CardHeader>
				<SimpleTable columns={WEEK_COLUMNS}>
					{analytics.weekly.map((week) => (
						<SimpleTableRow key={week.weekStart}>
							<TableCell className={CELL}>
								<LocalDateTime
									date={week.weekStart}
									options={{ month: "short", day: "numeric", year: "numeric" }}
								/>
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{week.dealsCreated}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{week.activities}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			</Card>
		</div>
	);
}
