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
import { Spinner } from "@crm/ui/components/spinner";
import { formatCount, formatMoneyCompact } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";

export function WeekFinanceWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const weekQuery = useQuery(trpc.finance.week.queryOptions({}));

	if (weekQuery.isPending) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>This week's finance</CardTitle>
					<CardDescription>
						Revenue, operator labour and expenses for booked events
					</CardDescription>
				</CardHeader>
				<div className="flex justify-center border-t py-10">
					<Spinner />
				</div>
			</Card>
		);
	}

	const week = weekQuery.data;

	if (weekQuery.isError || !week) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>This week's finance</CardTitle>
					<CardDescription>
						{weekQuery.error?.message ??
							"Setup required. Choose a business unit to read event finance."}
					</CardDescription>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>No finance data available.</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>This week's finance</CardTitle>
				<CardDescription>
					{formatCount(week.totals.events, "booked event")} · labour in{" "}
					{week.totals.operatorLabourCurrency}
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={`/${slug}/business-os/finance`}>Open finance</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				{week.totals.events === 0 ? (
					<CardPanelEmpty>No bookings this week.</CardPanelEmpty>
				) : (
					<div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
						<Metric
							label={`Expected · ${week.reportingCurrency}`}
							value={formatMoneyCompact(
								week.totals.expectedRevenueCents,
								week.reportingCurrency,
							)}
						/>
						<Metric
							label={`Labour · ${week.totals.operatorLabourCurrency}`}
							value={formatMoneyCompact(
								week.totals.operatorLabourCents,
								week.totals.operatorLabourCurrency,
							)}
						/>
						<Metric
							label="Gross profit"
							value={
								week.totals.projectedGrossProfitCents != null
									? formatMoneyCompact(
											week.totals.projectedGrossProfitCents,
											week.reportingCurrency,
										)
									: "—"
							}
						/>
					</div>
				)}
			</CardPanel>
		</Card>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-semibold text-lg tabular-nums">{value}</span>
		</div>
	);
}
