"use client";

import LinkIcon from "@carbon/icons-react/es/Link";
import Renew from "@carbon/icons-react/es/Renew";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { formatMoneyCompact } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

function formatAccountUnits(micros: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(micros / 1_000_000);
}

type AdsOutput = RouterOutputs["marketing"]["googleAds"];
type MarketingOverviewOutput = RouterOutputs["marketing"]["overview"];
type AdsCampaign = AdsOutput["campaigns"][number];
type AdsProvider = "GOOGLE_ADS" | "META_ADS";

export function MarketingOverview() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const [range, setRange] = useState<"today" | "7d" | "28d" | "90d">("28d");
	const overview = useQuery(trpc.marketing.overview.queryOptions());
	const summary = useQuery(
		trpc.marketing.performanceSummary.queryOptions({ range }),
	);
	const data = overview.data;

	if (!data || overview.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<Tabs
				value={range}
				onValueChange={(value) =>
					setRange(value as "today" | "7d" | "28d" | "90d")
				}
			>
				<TabsList>
					<TabsTrigger value="today">Today</TabsTrigger>
					<TabsTrigger value="7d">7 days</TabsTrigger>
					<TabsTrigger value="28d">28 days</TabsTrigger>
					<TabsTrigger value="90d">90 days</TabsTrigger>
				</TabsList>
			</Tabs>

			{summary.data ? (
				<>
					<StatGroup>
						<StatCard
							label="Leads"
							value={summary.data.leads}
							description="Attributed to a tracked source"
						/>
						<StatCard
							label="Bookings"
							value={summary.data.bookings}
							description="From attributed leads"
						/>
						<StatCard
							label="Attributed revenue"
							value={
								summary.data.attributedRevenueCents === null
									? "—"
									: formatMoneyCompact(
											summary.data.attributedRevenueCents,
											summary.data.currency,
										)
							}
							description={summary.data.currency}
						/>
						<StatCard
							label="Ad spend"
							value={
								summary.data.adSpendMicros === null
									? "—"
									: formatAccountUnits(summary.data.adSpendMicros)
							}
							description="Account currency, from snapshots"
						/>
						<StatCard
							label="Cost per lead"
							value={
								summary.data.costPerLeadMicros === null
									? "—"
									: formatAccountUnits(summary.data.costPerLeadMicros)
							}
							description="Account currency"
						/>
						<StatCard
							label="Cost per booking"
							value={
								summary.data.costPerBookingMicros === null
									? "—"
									: formatAccountUnits(summary.data.costPerBookingMicros)
							}
							description="Account currency"
						/>
						<StatCard
							label="ROAS"
							value={
								summary.data.roas === null ? "—" : summary.data.roas.toFixed(2)
							}
							description="Attributed revenue / ad spend"
						/>
					</StatGroup>
					{summary.data.notes.length > 0 ? (
						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Attribution notes</CardTitle>
								<CardDescription>{data.attribution.status}</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="flex flex-col gap-1 text-muted-foreground text-sm">
									{summary.data.notes.map((note) => (
										<li key={note}>{note}</li>
									))}
								</ul>
							</CardContent>
						</Card>
					) : null}
				</>
			) : null}

			<div className="grid gap-4 lg:grid-cols-3">
				<ChannelCard
					title="Email"
					href={workspaceUrl("/marketing/email")}
					integration={data.email.integration}
					metrics={data.email.metrics}
				/>
				<ChannelCard
					title="Google Ads"
					href={workspaceUrl("/marketing/ads/google")}
					integration={data.googleAds.integration}
					metrics={data.googleAds.metrics}
				/>
				<ChannelCard
					title="Meta Ads"
					href={workspaceUrl("/marketing/ads/meta")}
					integration={data.metaAds.integration}
					metrics={data.metaAds.metrics}
				/>
			</div>
		</div>
	);
}

export function AdsMarketingWorkspace({ provider }: { provider: AdsProvider }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceOptions =
		provider === "GOOGLE_ADS"
			? trpc.marketing.googleAds.queryOptions()
			: trpc.marketing.metaAds.queryOptions();
	const workspace = useQuery(workspaceOptions);
	const connect = useMutation(
		trpc.marketing.connectAds.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(`${providerLabel(provider)} connected.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const approval = useMutation(
		trpc.marketing.requestAction.mutationOptions({
			onSuccess: () => toast.success("Approval request created."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const sync = useMutation(
		trpc.marketing.syncAds.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				if (result.error) {
					toast.error(result.error);
				} else {
					toast.success(`${providerLabel(provider)} report synced.`);
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const data = workspace.data;

	if (!data || workspace.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<Tabs defaultValue="overview">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="campaigns">Campaigns</TabsTrigger>
					{provider === "GOOGLE_ADS" ? (
						<TabsTrigger value="search-terms">Search terms</TabsTrigger>
					) : null}
					<TabsTrigger value="performance">Performance</TabsTrigger>
				</TabsList>
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground text-xs">
						{data.syncedAt
							? `Synced ${new Date(data.syncedAt).toLocaleString()}`
							: "Not synced yet"}
					</p>
					<Button
						variant="outline"
						disabled={!data.integration.configured || sync.isPending}
						onClick={() => sync.mutate({ provider })}
					>
						<Icon icon={Renew} data-icon="inline-start" />
						Sync now
					</Button>
				</div>
			</div>

			<TabsContent value="overview" className="mt-6">
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<div className="flex min-w-0 flex-col gap-6">
						<AdsStats data={data} />
						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Snapshot reporting</CardTitle>
								<CardDescription>
									Numbers come from a cached snapshot, not from a live API call.
									Use Sync now to refresh. A background job also refreshes
									connected accounts every 6 hours.
								</CardDescription>
							</CardHeader>
						</Card>
					</div>
					<div className="flex min-w-0 flex-col gap-6">
						<IntegrationCard
							integration={data.integration}
							error={data.error}
						/>
						<AdsConnectionForm
							provider={provider}
							pending={connect.isPending}
							onSubmit={(event) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								connect.mutate({
									provider,
									accountId: required(form, "accountId"),
									label: optional(form, "label"),
									accessToken: required(form, "accessToken"),
									developerToken: optional(form, "developerToken"),
									loginCustomerId: optional(form, "loginCustomerId"),
									graphVersion: optional(form, "graphVersion"),
								});
							}}
						/>
					</div>
				</div>
			</TabsContent>

			<TabsContent value="campaigns" className="mt-6">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Campaigns</CardTitle>
						<CardDescription>
							Last 30 days from {providerLabel(provider)}.{" "}
							{provider === "GOOGLE_ADS"
								? "Ad groups nest under each campaign."
								: "Ad sets and ads nest under each campaign."}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{data.campaigns.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{data.syncedAt
									? "No campaigns are available from this account."
									: "No snapshot yet. Use Sync now to fetch campaigns."}
							</p>
						) : (
							data.campaigns.map((campaign) => (
								<AdsCampaignRow
									key={campaign.id}
									campaign={campaign}
									childLabel={
										provider === "GOOGLE_ADS" ? "Ad groups" : "Ad sets"
									}
									provider={provider}
									onPause={() =>
										approval.mutate({
											provider,
											action: "campaign.pause",
											summary: `Pause ${campaign.name}`,
											payload: { campaignId: campaign.id },
										})
									}
									disabled={approval.isPending}
								/>
							))
						)}
					</CardContent>
				</Card>
			</TabsContent>

			{provider === "GOOGLE_ADS" ? (
				<TabsContent value="search-terms" className="mt-6">
					<SearchTermsCard terms={data.searchTerms} />
				</TabsContent>
			) : null}

			<TabsContent value="performance" className="mt-6">
				<AdsPerformance data={data} provider={provider} />
			</TabsContent>
		</Tabs>
	);
}

function ChannelCard({
	title,
	href,
	integration,
	metrics,
}: {
	title: string;
	href: string;
	integration: MarketingOverviewOutput["email"]["integration"];
	metrics: MarketingOverviewOutput["email"]["metrics"];
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<div className="flex items-center justify-between gap-3">
					<CardTitle>{title}</CardTitle>
					<StatusIndicator
						tone={integrationTone(integration.status)}
						label={integration.status}
					/>
				</div>
				<CardDescription>{integration.label}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid grid-cols-2 gap-3">
					{metrics.slice(0, 4).map((metric) => (
						<div key={metric.label} className="rounded-md border p-3">
							<p className="text-muted-foreground text-xs">{metric.label}</p>
							<p className="mt-1 font-medium tabular-nums">
								{metric.measured ? formatMetric(metric) : "—"}
							</p>
						</div>
					))}
				</div>
				<Button asChild variant="outline">
					<Link href={href}>
						<Icon icon={LinkIcon} data-icon="inline-start" />
						Open
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}

export function AdsStats({ data }: { data: AdsOutput }) {
	return (
		<StatGroup>
			<StatCard
				label="Campaigns"
				value={data.campaigns.length}
				description="In the cached snapshot"
			/>
			{data.metrics.slice(0, 3).map((metric) => (
				<StatCard
					key={metric.label}
					label={metric.label}
					value={metric.measured ? formatMetric(metric) : "—"}
					description={metric.unit}
				/>
			))}
		</StatGroup>
	);
}

export function IntegrationCard({
	integration,
	error,
}: {
	integration: MarketingOverviewOutput["email"]["integration"];
	error: string | null;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Connection</CardTitle>
				<CardDescription>{integration.label}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				<StatusIndicator
					tone={integrationTone(integration.status)}
					label={integration.status}
				/>
				<InfoRow label="Account" value={integration.accountId} />
				<InfoRow label="URL" value={integration.baseUrl} />
				<InfoRow label="Auth" value={integration.authMethod} />
				<InfoRow label="Checked" value={integration.lastCheckedAt} />
				{error || integration.lastError ? (
					<p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
						{error ?? integration.lastError}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function AdsConnectionForm({
	provider,
	pending,
	onSubmit,
}: {
	provider: AdsProvider;
	pending: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Connect {providerLabel(provider)}</CardTitle>
				<CardDescription>Access tokens stay on the API server.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-3" onSubmit={onSubmit}>
					<Field name="accountId" label="Account ID" />
					<Field name="label" label="Label" />
					<Field name="accessToken" label="Access Token" type="password" />
					{provider === "GOOGLE_ADS" ? (
						<>
							<Field
								name="developerToken"
								label="Developer Token"
								type="password"
							/>
							<Field name="loginCustomerId" label="Login Customer ID" />
						</>
					) : (
						<Field
							name="graphVersion"
							label="Graph Version"
							placeholder="v24.0"
						/>
					)}
					<Button type="submit" disabled={pending}>
						<Icon icon={LinkIcon} data-icon="inline-start" />
						Connect
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

const SEARCH_TERM_COLUMNS = [
	{ id: "term", header: "Search term" },
	{ id: "campaign", header: "Campaign" },
	{ id: "impressions", header: "Impressions", width: "7rem" },
	{ id: "clicks", header: "Clicks", width: "5rem" },
	{ id: "ctr", header: "CTR", width: "5rem" },
	{ id: "cost", header: "Cost", width: "7rem" },
	{ id: "conversions", header: "Conv.", width: "5rem" },
];

const ADS_PERFORMANCE_COLUMNS = [
	{ id: "campaign", header: "Campaign" },
	{ id: "status", header: "Status", width: "7rem" },
	{ id: "spend", header: "Spend", width: "7rem" },
	{ id: "impressions", header: "Impressions", width: "7rem" },
	{ id: "clicks", header: "Clicks", width: "5rem" },
	{ id: "leads", header: "Leads", width: "5rem" },
	{ id: "cpl", header: "CPL", width: "6rem" },
	{ id: "roas", header: "ROAS", width: "5rem" },
];

function SearchTermsCard({ terms }: { terms: AdsOutput["searchTerms"] }) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Search terms</CardTitle>
				<CardDescription>
					Actual queries from the search terms report, last 30 days.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{terms.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No search terms in the current snapshot.
					</p>
				) : (
					<SimpleTable columns={SEARCH_TERM_COLUMNS} surface="page">
						{terms.map((term) => (
							<SimpleTableRow
								key={`${term.campaignId}:${term.adGroupId ?? ""}:${term.term}`}
							>
								<TableCell>
									<p className="truncate font-medium text-sm">{term.term}</p>
									{term.adGroupName ? (
										<p className="truncate text-muted-foreground text-xs">
											{term.adGroupName}
										</p>
									) : null}
								</TableCell>
								<TableCell>
									<p className="truncate text-sm">{term.campaignName}</p>
								</TableCell>
								<TableCell className="tabular-nums">
									{term.impressions === null ? (
										<EmptyCellValue />
									) : (
										formatNumber(term.impressions)
									)}
								</TableCell>
								<TableCell className="tabular-nums">
									{term.clicks === null ? (
										<EmptyCellValue />
									) : (
										formatNumber(term.clicks)
									)}
								</TableCell>
								<TableCell className="tabular-nums">
									{term.ctr === null ? (
										<EmptyCellValue />
									) : (
										`${(term.ctr * 100).toFixed(1)}%`
									)}
								</TableCell>
								<TableCell className="tabular-nums">
									{term.costMicros === null ? (
										<EmptyCellValue />
									) : (
										`${formatNumber(term.costMicros)} micros`
									)}
								</TableCell>
								<TableCell className="tabular-nums">
									{term.conversions === null ? (
										<EmptyCellValue />
									) : (
										formatNumber(term.conversions)
									)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</CardContent>
		</Card>
	);
}

function AdsPerformance({
	data,
	provider,
}: {
	data: AdsOutput;
	provider: AdsProvider;
}) {
	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				{data.metrics.map((metric) => (
					<StatCard
						key={metric.label}
						label={metric.label}
						value={metric.measured ? formatMetric(metric) : "—"}
						description={metric.measured ? metric.unit : "Not measured yet"}
					/>
				))}
			</StatGroup>
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Campaign performance</CardTitle>
					<CardDescription>
						Cached snapshot from {providerLabel(provider)}. Missing values stay
						empty.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.campaigns.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No campaigns in the current snapshot.
						</p>
					) : (
						<SimpleTable columns={ADS_PERFORMANCE_COLUMNS} surface="page">
							{data.campaigns.map((campaign) => (
								<SimpleTableRow key={campaign.id}>
									<TableCell>
										<p className="truncate font-medium text-sm">
											{campaign.name}
										</p>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{campaign.status}</Badge>
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.spendMicros === null ? (
											<EmptyCellValue />
										) : (
											formatNumber(campaign.spendMicros)
										)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.impressions === null ? (
											<EmptyCellValue />
										) : (
											formatNumber(campaign.impressions)
										)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.clicks === null ? (
											<EmptyCellValue />
										) : (
											formatNumber(campaign.clicks)
										)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.conversions === null ? (
											<EmptyCellValue />
										) : (
											formatNumber(campaign.conversions)
										)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.cpaMicros === null ? (
											<EmptyCellValue />
										) : (
											formatNumber(campaign.cpaMicros)
										)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.roas === null ? (
											<EmptyCellValue />
										) : (
											campaign.roas.toFixed(2)
										)}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</CardContent>
			</Card>
			{provider === "META_ADS" ? (
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Search terms</CardTitle>
						<CardDescription>
							Search terms are a Google Ads report. Meta Ads does not provide
							them; use the Campaigns tab for ad set and ad level detail.
						</CardDescription>
					</CardHeader>
				</Card>
			) : null}
		</div>
	);
}

type AdsEntityMetrics = {
	spendMicros: number | null;
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	cpcMicros: number | null;
	conversions: number | null;
	conversionValue: number | null;
	cpaMicros: number | null;
	roas: number | null;
	reach: number | null;
	cpmMicros: number | null;
	costPerResultMicros: number | null;
};

function entityMetrics(
	entity: AdsEntityMetrics,
	provider: AdsProvider,
): {
	label: string;
	value: number | null;
	suffix?: string;
	percent?: boolean;
}[] {
	if (provider === "META_ADS") {
		return [
			{ label: "Spend", value: entity.spendMicros, suffix: "micros" },
			{ label: "Reach", value: entity.reach },
			{ label: "Impressions", value: entity.impressions },
			{ label: "Clicks", value: entity.clicks },
			{ label: "CTR", value: entity.ctr, percent: true },
			{ label: "CPC", value: entity.cpcMicros, suffix: "micros" },
			{ label: "CPM", value: entity.cpmMicros, suffix: "micros" },
			{ label: "Leads", value: entity.conversions },
			{
				label: "Cost / result",
				value: entity.costPerResultMicros,
				suffix: "micros",
			},
			{ label: "Conv. value", value: entity.conversionValue },
			{ label: "ROAS", value: entity.roas },
		];
	}
	return [
		{ label: "Spend", value: entity.spendMicros, suffix: "micros" },
		{ label: "Impressions", value: entity.impressions },
		{ label: "Clicks", value: entity.clicks },
		{ label: "CTR", value: entity.ctr, percent: true },
		{ label: "CPC", value: entity.cpcMicros, suffix: "micros" },
		{ label: "Conversions", value: entity.conversions },
		{ label: "Cost / conv.", value: entity.cpaMicros, suffix: "micros" },
		{ label: "Conv. value", value: entity.conversionValue },
		{ label: "ROAS", value: entity.roas },
	];
}

function AdsCampaignRow({
	campaign,
	childLabel,
	provider,
	onPause,
	disabled,
}: {
	campaign: AdsCampaign;
	childLabel: string;
	provider: AdsProvider;
	onPause: () => void;
	disabled: boolean;
}) {
	return (
		<article className="rounded-lg border p-4">
			<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate font-medium">{campaign.name}</h2>
						<Badge variant="outline">{campaign.status}</Badge>
						{campaign.type ? (
							<Badge variant="secondary">{campaign.type}</Badge>
						) : null}
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
						{entityMetrics(campaign, provider).map((metric) => (
							<Metric
								key={metric.label}
								label={metric.label}
								value={metric.value}
								suffix={metric.suffix}
								percent={metric.percent}
							/>
						))}
					</div>
				</div>
				<Button variant="outline" onClick={onPause} disabled={disabled}>
					Request Pause
				</Button>
			</div>
			{campaign.children.length > 0 ? (
				<div className="mt-4 flex flex-col gap-3 border-l pl-4">
					<p className="text-muted-foreground text-xs">{childLabel}</p>
					{campaign.children.map((child) => (
						<div key={child.id} className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<p className="truncate font-medium text-sm">{child.name}</p>
								<Badge variant="outline">{child.status}</Badge>
							</div>
							<div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
								{entityMetrics(child, provider).map((metric) => (
									<Metric
										key={metric.label}
										label={metric.label}
										value={metric.value}
										suffix={metric.suffix}
										percent={metric.percent}
									/>
								))}
							</div>
							{child.children.length > 0 ? (
								<div className="mt-2 flex flex-col gap-2 border-l pl-4">
									<p className="text-muted-foreground text-xs">Ads</p>
									{child.children.map((ad) => (
										<div
											key={ad.id}
											className="flex min-w-0 flex-wrap items-center gap-2"
										>
											<p className="truncate text-sm">{ad.name}</p>
											<Badge variant="outline">{ad.status}</Badge>
											<span className="text-muted-foreground text-xs tabular-nums">
												{ad.impressions === null
													? "—"
													: `${formatNumber(ad.impressions)} impressions`}
											</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												{ad.reach === null
													? "—"
													: `${formatNumber(ad.reach)} reach`}
											</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												{ad.clicks === null
													? "—"
													: `${formatNumber(ad.clicks)} clicks`}
											</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												{ad.costPerResultMicros === null
													? "—"
													: `${formatNumber(ad.costPerResultMicros)} micros / result`}
											</span>
										</div>
									))}
								</div>
							) : null}
						</div>
					))}
				</div>
			) : null}
		</article>
	);
}

export function ListBlock({
	title,
	rows,
}: {
	title: string;
	rows: { id: string; name: string; detail: string }[];
}) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<h2 className="font-medium text-sm">{title}</h2>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">No rows returned.</p>
			) : (
				rows.map((row) => (
					<div key={row.id} className="rounded-md border p-3">
						<p className="truncate font-medium text-sm">{row.name}</p>
						<p className="mt-1 truncate text-muted-foreground text-xs">
							{row.detail}
						</p>
					</div>
				))
			)}
		</div>
	);
}

export function Field({
	name,
	label,
	type = "text",
	placeholder,
}: {
	name: string;
	label: string;
	type?: string;
	placeholder?: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={name}>{label}</Label>
			<Input id={name} name={name} type={type} placeholder={placeholder} />
		</div>
	);
}

export function Metric({
	label,
	value,
	suffix,
	percent,
}: {
	label: string;
	value: number | null;
	suffix?: string;
	percent?: boolean;
}) {
	return (
		<div className="rounded-md bg-muted px-2.5 py-2">
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-1 font-medium tabular-nums">
				{value === null
					? "—"
					: percent
						? `${(value * 100).toFixed(1)}%`
						: `${formatNumber(value)}${suffix ? ` ${suffix}` : ""}`}
			</p>
		</div>
	);
}

export function InfoRow({
	label,
	value,
}: {
	label: string;
	value: string | null;
}) {
	return (
		<div className="flex min-w-0 justify-between gap-3 border-b py-2 last:border-b-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right">{value ?? <EmptyCellValue />}</span>
		</div>
	);
}

export function integrationTone(status: string): StatusTone {
	if (status === "CONNECTED") return "success";
	if (status === "NEEDS_ATTENTION") return "warning";
	return "neutral";
}

function providerLabel(provider: AdsProvider): string {
	return provider === "GOOGLE_ADS" ? "Google Ads" : "Meta Ads";
}

export function formatMetric(metric: {
	value: number | null;
	unit: string;
}): string {
	if (metric.value === null) return "—";
	if (metric.unit === "ratio") return metric.value.toFixed(2);
	return formatNumber(metric.value);
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
	}).format(value);
}

export function required(form: FormData, name: string): string {
	const value = form.get(name);
	if (value === null || value instanceof File) return "";
	return value.trim();
}

export function optional(form: FormData, name: string): string | undefined {
	const value = required(form, name);
	return value || undefined;
}

export function parseIds(value: string): number[] {
	return splitList(value)
		.map((item) => Number(item))
		.filter((item) => Number.isInteger(item) && item > 0);
}

export function splitList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}
