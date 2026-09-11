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
import { formatPercent } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";

export function WebsiteAnalyticsWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const reportQuery = useQuery(
		trpc.googleAnalytics.report.queryOptions({ days: 28 }),
	);

	if (reportQuery.isPending) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Website analytics</CardTitle>
					<CardDescription>Google Analytics 4, last 28 days</CardDescription>
				</CardHeader>
				<div className="flex justify-center border-t py-10">
					<Spinner />
				</div>
			</Card>
		);
	}

	const report = reportQuery.data;
	const settingsHref = `/${slug}/settings/connections/google`;

	if (report?.state !== "ok") {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Website analytics</CardTitle>
					<CardDescription>
						Setup required. Grant the read-only Google Analytics permission and
						choose a GA4 property.
					</CardDescription>
					<CardAction>
						<Button asChild variant="outline" size="sm">
							<Link href={settingsHref}>Set up</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>
						No analytics data until setup is done.
					</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Website analytics</CardTitle>
				<CardDescription>
					{report.property.name ?? `Property ${report.property.id}`} · last 28
					days
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={`/${slug}/business-os/analytics`}>Open analytics</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				<div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
					<Metric label="Users" value={report.summary.users.toLocaleString()} />
					<Metric
						label="Sessions"
						value={report.summary.sessions.toLocaleString()}
					/>
					<Metric label="Views" value={report.summary.views.toLocaleString()} />
					<Metric
						label="Engagement"
						value={
							report.summary.engagementRate != null
								? formatPercent(report.summary.engagementRate)
								: "—"
						}
					/>
				</div>
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
