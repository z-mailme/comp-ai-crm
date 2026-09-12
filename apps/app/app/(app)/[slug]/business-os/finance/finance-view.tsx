"use client";

import {
	Card,
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
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import {
	formatCount,
	formatMoney,
	formatMoneyCompact,
} from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LocalDateTime } from "@/components/local-date-time";
import { dealStagePresentation } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { FinanceDashboard } from "./finance-module-view";
import { WeekFinance } from "./week-finance";

const CELL = "px-3 py-2.5 align-middle";

const CLOSING_COLUMNS: SimpleTableColumn[] = [
	{ id: "deal", header: "Deal" },
	{
		id: "company",
		header: "Company",
		width: "w-44",
		className: "hidden md:table-cell",
	},
	{ id: "stage", header: "Stage", width: "w-40" },
	{ id: "close", header: "Expected close", width: "w-36" },
	{ id: "amount", header: "Deal amount", width: "w-32", align: "right" },
	{ id: "value", header: "Value", width: "w-32", align: "right" },
];

export function FinanceView() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const financeQuery = useQuery(trpc.businessOs.finance.queryOptions());
	const finance = financeQuery.data;

	if (!finance) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const currency = finance.reportingCurrency;

	return (
		<div className="flex flex-col gap-6">
			<FinanceDashboard />

			<WeekFinance />

			<StatGroup>
				<StatCard
					label="Open pipeline value"
					value={formatMoneyCompact(
						finance.openPipeline.baseValueCents,
						currency,
					)}
					description={`${formatCount(finance.openPipeline.count, "open deal")} in ${currency}`}
				/>
				<StatCard
					label="Won value · all time"
					value={formatMoneyCompact(
						finance.wonAllTime.baseValueCents,
						currency,
					)}
					description={`${formatCount(finance.wonAllTime.count, "deal")} won`}
				/>
				<StatCard
					label="Won value · 90 days"
					value={formatMoneyCompact(finance.won90d.baseValueCents, currency)}
					description={`${formatCount(finance.won90d.count, "deal")} won, ${formatCount(finance.lost90d.count, "deal")} lost`}
				/>
				<StatCard
					label="Average open deal"
					value={
						finance.avgOpenDealCents != null
							? formatMoneyCompact(finance.avgOpenDealCents, currency)
							: "—"
					}
					description="Open deals with a converted value"
				/>
			</StatGroup>

			{finance.openPipeline.unconverted.count > 0 ? (
				<p className="text-muted-foreground text-sm">
					{formatCount(finance.openPipeline.unconverted.count, "open deal")} in{" "}
					{finance.openPipeline.unconverted.currencies.join(", ")} have no
					exchange rate. They count in deal totals but not in value totals.
				</p>
			) : null}

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Closing soon</CardTitle>
					<CardDescription>
						Open deals with an expected close date in the next 30 days. Values
						in {currency}.
					</CardDescription>
				</CardHeader>
				{finance.closingSoon.length === 0 ? (
					<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
						No open deal expects to close in the next 30 days.
					</p>
				) : (
					<SimpleTable columns={CLOSING_COLUMNS}>
						{finance.closingSoon.map((deal) => {
							const stage = dealStagePresentation(deal.stage);

							return (
								<SimpleTableRow key={deal.id}>
									<TableCell className={CELL}>
										<Link
											href={workspaceUrl(`/deals/${deal.id}`)}
											className="truncate font-medium hover:underline"
										>
											{deal.name}
										</Link>
									</TableCell>
									<TableCell className={`${CELL} hidden md:table-cell`}>
										{deal.companyName}
									</TableCell>
									<TableCell className={CELL}>
										<StatusIndicator
											size="sm"
											tone={stage.tone}
											label={stage.label}
										/>
									</TableCell>
									<TableCell className={CELL}>
										<LocalDateTime
											date={deal.expectedCloseDate}
											options={{
												month: "short",
												day: "numeric",
												year: "numeric",
											}}
										/>
									</TableCell>
									<TableCell className={`${CELL} text-right tabular-nums`}>
										{deal.amountCents != null ? (
											formatMoney(deal.amountCents, deal.currency)
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell className={`${CELL} text-right tabular-nums`}>
										{deal.baseAmountCents != null ? (
											formatMoney(deal.baseAmountCents, currency)
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
								</SimpleTableRow>
							);
						})}
					</SimpleTable>
				)}
			</Card>

			<p className="text-muted-foreground text-xs">
				Generated <LocalDateTime date={finance.generatedAt} options={{}} /> ·
				values in {currency}. Deal amounts show the original currency.
			</p>
		</div>
	);
}
