"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardGrid, StatGroup } from "@crm/ui/components/dashboard";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	formatCount,
	formatMoney,
	formatMoneyCompact,
	formatPercent,
} from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { BarTrend, DonutStat } from "@/components/dashboard-charts";
import { LocalDateTime } from "@/components/local-date-time";
import { dealStageColor, dealStageLabel } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";

const WEEKLY_CONFIG = {
	deals: { label: "New deals", color: "var(--chart-1)" },
	activities: { label: "Activities", color: "var(--chart-3)" },
};

export function AnalyticsView() {
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
	const exact = (value: number | string) =>
		typeof value === "number" ? money(value) : value;
	const stageSlices = analytics.pipeline.stages
		.filter((stage) => stage.count > 0)
		.map((stage) => ({
			key: stage.stage,
			label: dealStageLabel(stage.stage),
			value: stage.baseValueCents,
			count: stage.count,
			color: dealStageColor(stage.stage),
		}));
	const weekly = analytics.weekly.map((week) => ({
		week: week.weekStart,
		deals: week.dealsCreated,
		activities: week.activities,
	}));

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Open pipeline value"
					value={formatMoneyCompact(
						analytics.pipeline.openBaseValueCents,
						analytics.reportingCurrency,
					)}
					description={`${formatCount(analytics.pipeline.openCount, "open deal")} in ${analytics.reportingCurrency}`}
				/>
				<StatCard
					label="Won value · 90 days"
					value={formatMoneyCompact(
						analytics.outcomes90d.wonBaseValueCents,
						analytics.reportingCurrency,
					)}
					description={`${formatCount(analytics.outcomes90d.wonCount, "deal")} won`}
				/>
				<StatCard
					label="Lost value · 90 days"
					value={formatMoneyCompact(
						analytics.outcomes90d.lostBaseValueCents,
						analytics.reportingCurrency,
					)}
					description={`${formatCount(analytics.outcomes90d.lostCount, "deal")} lost or unqualified`}
				/>
				<StatCard
					label="Win rate · 90 days"
					value={
						analytics.outcomes90d.winRate != null
							? formatPercent(analytics.outcomes90d.winRate)
							: "—"
					}
					description="Won deals over decided deals"
				/>
			</StatGroup>

			{analytics.pipeline.unconvertedOpen.count > 0 ? (
				<p className="text-muted-foreground text-sm">
					{formatCount(analytics.pipeline.unconvertedOpen.count, "open deal")}{" "}
					in {analytics.pipeline.unconvertedOpen.currencies.join(", ")} have no
					exchange rate. They count in deal totals but not in value totals.
				</p>
			) : null}

			<DashboardGrid columns={2}>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Open pipeline by stage</CardTitle>
						<CardDescription>
							Value in {analytics.reportingCurrency} by pipeline stage.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{stageSlices.length > 0 ? (
							<DonutStat
								data={stageSlices}
								height={200}
								centerValue={formatMoneyCompact(
									analytics.pipeline.openBaseValueCents,
									analytics.reportingCurrency,
								)}
								centerLabel="open"
								formatValue={exact}
							/>
						) : (
							<p className="py-10 text-center text-muted-foreground text-sm">
								No open deals.
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Weekly momentum</CardTitle>
						<CardDescription>
							New deals and recorded activities per week, last 12 weeks.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BarTrend
							data={weekly}
							config={WEEKLY_CONFIG}
							xKey="week"
							height={200}
							showLegend
							formatX={(value) =>
								new Date(value).toLocaleDateString(undefined, {
									month: "short",
									day: "numeric",
								})
							}
						/>
					</CardContent>
				</Card>
			</DashboardGrid>

			<p className="text-muted-foreground text-xs">
				Generated <LocalDateTime date={analytics.generatedAt} options={{}} /> ·
				values in {analytics.reportingCurrency}.
			</p>
		</div>
	);
}
