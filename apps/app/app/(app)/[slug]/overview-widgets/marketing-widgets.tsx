"use client";

import { Badge } from "@crm/ui/components/badge";
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
import {
	formatCount,
	formatDay,
	formatMoneyCompact,
	toDay,
} from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useTRPC } from "@/lib/trpc/client";

function WidgetShell({
	title,
	description,
	href,
	linkLabel,
	children,
}: {
	title: string;
	description: string;
	href: string;
	linkLabel: string;
	children: ReactNode;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={href}>{linkLabel}</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>{children}</CardPanel>
		</Card>
	);
}

function Pending() {
	return (
		<div className="flex justify-center py-10">
			<Spinner />
		</div>
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

function formatAccountUnits(micros: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(micros / 1_000_000);
}

export function MarketingPerformanceWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useQuery(
		trpc.marketing.performanceSummary.queryOptions({ range: "28d" }),
	);

	return (
		<WidgetShell
			title="Marketing performance"
			description="Attributed leads, bookings, revenue and ad spend over 28 days"
			href={`/${slug}/marketing`}
			linkLabel="Open marketing"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No marketing data available."}
				</CardPanelEmpty>
			) : (
				<div className="flex flex-col gap-3 px-5 py-4">
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<Metric
							label="Leads"
							value={formatCount(query.data.leads, "lead")}
						/>
						<Metric
							label="Bookings"
							value={formatCount(query.data.bookings, "booking")}
						/>
						<Metric
							label={`Revenue · ${query.data.currency}`}
							value={
								query.data.attributedRevenueCents === null
									? "—"
									: formatMoneyCompact(
											query.data.attributedRevenueCents,
											query.data.currency,
										)
							}
						/>
						<Metric
							label="Ad spend · acct ccy"
							value={
								query.data.adSpendMicros === null
									? "—"
									: formatAccountUnits(query.data.adSpendMicros)
							}
						/>
						<Metric
							label="Cost / lead · acct ccy"
							value={
								query.data.costPerLeadMicros === null
									? "—"
									: formatAccountUnits(query.data.costPerLeadMicros)
							}
						/>
						<Metric
							label="ROAS"
							value={
								query.data.roas === null ? "—" : query.data.roas.toFixed(2)
							}
						/>
					</div>
					{query.data.notes.length > 0 ? (
						<p className="text-muted-foreground text-xs">
							{query.data.notes[0]}
						</p>
					) : null}
				</div>
			)}
		</WidgetShell>
	);
}

function AdsWidget({
	provider,
	title,
	href,
}: {
	provider: "GOOGLE_ADS" | "META_ADS";
	title: string;
	href: string;
}) {
	const trpc = useTRPC();
	const query = useQuery(
		provider === "GOOGLE_ADS"
			? trpc.marketing.googleAds.queryOptions()
			: trpc.marketing.metaAds.queryOptions(),
	);

	return (
		<WidgetShell
			title={title}
			description="Cached snapshot, last 30 days"
			href={href}
			linkLabel="Open"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No ads data available."}
				</CardPanelEmpty>
			) : !query.data.integration.configured ? (
				<CardPanelEmpty>Setup required. Connect the account.</CardPanelEmpty>
			) : query.data.campaigns.length === 0 ? (
				<CardPanelEmpty>
					{query.data.syncedAt
						? "No campaigns in the current snapshot."
						: "No snapshot yet. Sync from the ads page."}
				</CardPanelEmpty>
			) : (
				<div className="flex flex-col gap-3 px-5 py-4">
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						{query.data.metrics.slice(0, 3).map((metric) => (
							<Metric
								key={metric.label}
								label={
									metric.unit === "micros"
										? `${metric.label} · acct ccy`
										: metric.label
								}
								value={
									metric.measured && metric.value !== null
										? metric.unit === "micros"
											? formatAccountUnits(metric.value)
											: metric.unit === "ratio"
												? metric.value.toFixed(2)
												: String(metric.value)
										: "—"
								}
							/>
						))}
					</div>
					<p className="text-muted-foreground text-xs">
						{formatCount(query.data.campaigns.length, "campaign")}
						{query.data.syncedAt
							? ` · synced ${formatDay(toDay(new Date(query.data.syncedAt)))}`
							: ""}
					</p>
				</div>
			)}
		</WidgetShell>
	);
}

export function GoogleAdsPerformanceWidget() {
	const { slug } = useParams<{ slug: string }>();
	return (
		<AdsWidget
			provider="GOOGLE_ADS"
			title="Google Ads"
			href={`/${slug}/marketing/ads/google`}
		/>
	);
}

export function MetaAdsPerformanceWidget() {
	const { slug } = useParams<{ slug: string }>();
	return (
		<AdsWidget
			provider="META_ADS"
			title="Meta Ads"
			href={`/${slug}/marketing/ads/meta`}
		/>
	);
}

export function EmailPerformanceWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useQuery(trpc.marketing.email.queryOptions());

	return (
		<WidgetShell
			title="Email performance"
			description="Live counters from Listmonk"
			href={`/${slug}/marketing/email`}
			linkLabel="Open email"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No email data available."}
				</CardPanelEmpty>
			) : !query.data.integration.configured ? (
				<CardPanelEmpty>Setup required. Connect Listmonk.</CardPanelEmpty>
			) : (
				<div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
					{query.data.metrics.map((metric) => (
						<Metric
							key={metric.label}
							label={metric.label}
							value={
								metric.measured && metric.value !== null
									? formatCount(metric.value, "event")
									: "—"
							}
						/>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

export function SocialScheduleWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const now = new Date();
	const inThirtyDays = new Date(now);
	inThirtyDays.setDate(inThirtyDays.getDate() + 30);
	const query = useQuery(
		trpc.marketingSocial.calendar.queryOptions({
			from: now.toISOString(),
			to: inThirtyDays.toISOString(),
		}),
	);

	return (
		<WidgetShell
			title="Social schedule"
			description="Scheduled posts, content and campaigns for the next 30 days"
			href={`/${slug}/marketing/social`}
			linkLabel="Open social"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No social data available."}
				</CardPanelEmpty>
			) : query.data.items.length === 0 ? (
				<CardPanelEmpty>Nothing scheduled in the next 30 days.</CardPanelEmpty>
			) : (
				<div className="flex flex-col px-5 py-2">
					{query.data.items.slice(0, 5).map((item) => (
						<div
							key={`${item.kind}:${item.id}`}
							className="flex min-w-0 items-center justify-between gap-3 border-b py-2 last:border-b-0"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">{item.title}</p>
								<p className="text-muted-foreground text-xs">
									{formatDay(toDay(new Date(item.at)))}
								</p>
							</div>
							<Badge variant="outline">{item.status}</Badge>
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

export function UpcomingContentWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useQuery(trpc.marketingContent.list.queryOptions({}));

	const upcoming = (query.data?.rows ?? [])
		.filter((row) => row.scheduledAt !== null)
		.filter((row) => new Date(row.scheduledAt as string) >= new Date())
		.sort(
			(a, b) =>
				new Date(a.scheduledAt as string).getTime() -
				new Date(b.scheduledAt as string).getTime(),
		)
		.slice(0, 5);

	return (
		<WidgetShell
			title="Upcoming content"
			description="Content with a scheduled date from today onward"
			href={`/${slug}/marketing/content`}
			linkLabel="Open content"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No content data available."}
				</CardPanelEmpty>
			) : upcoming.length === 0 ? (
				<CardPanelEmpty>No scheduled content.</CardPanelEmpty>
			) : (
				<div className="flex flex-col px-5 py-2">
					{upcoming.map((row) => (
						<div
							key={row.id}
							className="flex min-w-0 items-center justify-between gap-3 border-b py-2 last:border-b-0"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">{row.title}</p>
								<p className="text-muted-foreground text-xs">
									{row.scheduledAt
										? formatDay(toDay(new Date(row.scheduledAt)))
										: ""}
								</p>
							</div>
							<Badge variant="outline">{row.status}</Badge>
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

export function CampaignPerformanceWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useQuery(trpc.marketingCampaigns.performance.queryOptions({}));

	const rows = (query.data?.rows ?? [])
		.slice()
		.sort(
			(a, b) =>
				(b.closedRevenueCents ?? -1) - (a.closedRevenueCents ?? -1) ||
				b.leads - a.leads,
		)
		.slice(0, 5);

	return (
		<WidgetShell
			title="Campaign performance"
			description="Leads, bookings and closed revenue per campaign"
			href={`/${slug}/marketing/campaigns`}
			linkLabel="Open campaigns"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No campaign data available."}
				</CardPanelEmpty>
			) : rows.length === 0 ? (
				<CardPanelEmpty>No campaigns yet.</CardPanelEmpty>
			) : (
				<div className="flex flex-col px-5 py-2">
					{rows.map((row) => (
						<div
							key={row.campaignId}
							className="flex min-w-0 items-center justify-between gap-3 border-b py-2 last:border-b-0"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">{row.name}</p>
								<p className="text-muted-foreground text-xs">
									{formatCount(row.leads, "lead")} ·{" "}
									{formatCount(row.bookings, "booking")}
								</p>
							</div>
							<span className="shrink-0 font-medium text-sm tabular-nums">
								{row.closedRevenueCents === null
									? "—"
									: formatMoneyCompact(row.closedRevenueCents, row.currency)}
							</span>
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

function SourcesWidget({
	title,
	description,
	metric,
}: {
	title: string;
	description: string;
	metric: "leads" | "revenue";
}) {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useQuery(trpc.marketingCampaigns.sources.queryOptions({}));

	const rows = (query.data?.rows ?? [])
		.filter((row) =>
			metric === "revenue" ? row.closedRevenueCents !== null : row.leads > 0,
		)
		.slice(0, 6);

	return (
		<WidgetShell
			title={title}
			description={description}
			href={`/${slug}/marketing`}
			linkLabel="Open marketing"
		>
			{query.isPending ? (
				<Pending />
			) : query.isError || !query.data ? (
				<CardPanelEmpty>
					{query.error?.message ?? "No attribution data available."}
				</CardPanelEmpty>
			) : rows.length === 0 ? (
				<CardPanelEmpty>
					No attributed {metric === "leads" ? "leads" : "revenue"} yet.
				</CardPanelEmpty>
			) : (
				<div className="flex flex-col px-5 py-2">
					{rows.map((row) => (
						<div
							key={`${row.source}:${row.medium}`}
							className="flex min-w-0 items-center justify-between gap-3 border-b py-2 last:border-b-0"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">{row.source}</p>
								<p className="text-muted-foreground text-xs">{row.medium}</p>
							</div>
							<span className="shrink-0 font-medium text-sm tabular-nums">
								{metric === "leads"
									? formatCount(row.leads, "lead")
									: row.closedRevenueCents === null
										? "—"
										: formatMoneyCompact(
												row.closedRevenueCents,
												query.data.currency,
											)}
							</span>
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

export function LeadsBySourceWidget() {
	return (
		<SourcesWidget
			title="Leads by source"
			description="First-touch source and medium of attributed leads"
			metric="leads"
		/>
	);
}

export function RevenueByChannelWidget() {
	return (
		<SourcesWidget
			title="Revenue by channel"
			description="Closed revenue from attributed sources"
			metric="revenue"
		/>
	);
}
