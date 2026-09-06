"use client";

import Add from "@carbon/icons-react/es/Add";
import LinkIcon from "@carbon/icons-react/es/Link";
import Send from "@carbon/icons-react/es/Send";
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
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type EmailOutput = RouterOutputs["marketing"]["email"];
type AdsOutput = RouterOutputs["marketing"]["googleAds"];
type MarketingOverviewOutput = RouterOutputs["marketing"]["overview"];
type EmailCampaign = EmailOutput["campaigns"][number];
type AdsCampaign = AdsOutput["campaigns"][number];
type AdsProvider = "GOOGLE_ADS" | "META_ADS";

export function MarketingOverview() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const overview = useQuery(trpc.marketing.overview.queryOptions());
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
			<StatGroup>
				<StatCard
					label="Campaign leads"
					value={data.crm.campaignLeads}
					description="CRM events with lead intent"
				/>
				<StatCard
					label="Deals"
					value={data.crm.deals}
					description="Deals in the selected business"
				/>
				<StatCard
					label="Bookings"
					value={data.crm.bookings}
					description="Bookings with CRM links"
				/>
				<StatCard
					label="Attribution"
					value={data.attribution.available ? "On" : "Off"}
					description={data.attribution.status}
				/>
			</StatGroup>

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

export function EmailMarketingWorkspace() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const email = useQuery(trpc.marketing.email.queryOptions());
	const connect = useMutation(
		trpc.marketing.connectListmonk.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Listmonk connected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const createCampaign = useMutation(
		trpc.marketing.createListmonkCampaign.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Campaign created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const sendTest = useMutation(
		trpc.marketing.sendListmonkTest.mutationOptions({
			onSuccess: () => toast.success("Test send requested."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const approval = useMutation(
		trpc.marketing.requestAction.mutationOptions({
			onSuccess: () => toast.success("Approval request created."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const data = email.data;

	if (!data || email.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<div className="flex min-w-0 flex-col gap-6">
				<EmailStats data={data} />
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Campaigns</CardTitle>
						<CardDescription>
							Stored campaign rows from Listmonk.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{data.campaigns.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No campaigns are available from Listmonk.
							</p>
						) : (
							data.campaigns.map((campaign) => (
								<EmailCampaignRow
									key={campaign.id}
									campaign={campaign}
									onRequestApproval={() =>
										approval.mutate({
											provider: "LISTMONK",
											action: "campaign.send",
											summary: `Send ${campaign.name}`,
											payload: { campaignId: campaign.id },
										})
									}
									disabled={approval.isPending}
								/>
							))
						)}
					</CardContent>
				</Card>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Lists and Templates</CardTitle>
						<CardDescription>
							Audience and template state from Listmonk.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<ListBlock
							title="Lists"
							rows={data.lists.map((list) => ({
								id: String(list.id),
								name: list.name,
								detail: `${list.status} · ${
									list.subscriberCount ?? 0
								} subscribers`,
							}))}
						/>
						<ListBlock
							title="Templates"
							rows={data.templates.map((template) => ({
								id: String(template.id),
								name: template.name,
								detail: template.type ?? "No type",
							}))}
						/>
					</CardContent>
				</Card>
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				<IntegrationCard integration={data.integration} error={data.error} />
				<ListmonkConnectionForm
					pending={connect.isPending}
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const authMethod =
							form.get("authMethod") === "token" ? "token" : "basic";
						connect.mutate({
							baseUrl: required(form, "baseUrl"),
							authMethod,
							username: optional(form, "username"),
							password: optional(form, "password"),
							token: optional(form, "token"),
						});
					}}
				/>
				<CreateCampaignForm
					pending={createCampaign.isPending}
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const listIds = parseIds(required(form, "listIds"));
						if (listIds.length === 0) {
							toast.error("Add at least one list ID.");
							return;
						}
						createCampaign.mutate({
							name: required(form, "name"),
							subject: required(form, "subject"),
							body: required(form, "body"),
							listIds,
						});
					}}
				/>
				<TestSendForm
					pending={sendTest.isPending}
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const recipients = splitList(required(form, "recipients"));
						if (recipients.length === 0) {
							toast.error("Add at least one recipient.");
							return;
						}
						sendTest.mutate({
							campaignId: Number(required(form, "campaignId")),
							recipients,
						});
					}}
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
	const data = workspace.data;

	if (!data || workspace.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<div className="flex min-w-0 flex-col gap-6">
				<AdsStats data={data} />
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Campaigns</CardTitle>
						<CardDescription>
							Last 30 days from {providerLabel(provider)}.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{data.campaigns.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No campaigns are available from this account.
							</p>
						) : (
							data.campaigns.map((campaign) => (
								<AdsCampaignRow
									key={campaign.id}
									campaign={campaign}
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
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				<IntegrationCard integration={data.integration} error={data.error} />
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

function EmailStats({ data }: { data: EmailOutput }) {
	return (
		<StatGroup>
			<StatCard
				label="Campaigns"
				value={data.campaigns.length}
				description="Returned from Listmonk"
			/>
			<StatCard
				label="Lists"
				value={data.lists.length}
				description={`${data.subscribers.total ?? 0} subscribers`}
			/>
			{data.metrics.slice(0, 2).map((metric) => (
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

function AdsStats({ data }: { data: AdsOutput }) {
	return (
		<StatGroup>
			<StatCard
				label="Campaigns"
				value={data.campaigns.length}
				description="Returned from ad account"
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

function IntegrationCard({
	integration,
	error,
}: {
	integration: EmailOutput["integration"];
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

function ListmonkConnectionForm({
	pending,
	onSubmit,
}: {
	pending: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Connect Listmonk</CardTitle>
				<CardDescription>Credentials stay on the API server.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-3" onSubmit={onSubmit}>
					<Field
						name="baseUrl"
						label="Base URL"
						placeholder="https://mail.example.com"
					/>
					<label className="flex flex-col gap-1.5 text-xs font-medium">
						Auth Method
						<select
							name="authMethod"
							className="h-8 rounded-md border bg-background px-2.5 text-xs"
							defaultValue="basic"
						>
							<option value="basic">Basic</option>
							<option value="token">Token</option>
						</select>
					</label>
					<Field name="username" label="User" placeholder="listmonk" />
					<Field name="password" label="Password" type="password" />
					<Field name="token" label="Token" type="password" />
					<Button type="submit" disabled={pending}>
						<Icon icon={LinkIcon} data-icon="inline-start" />
						Connect
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function CreateCampaignForm({
	pending,
	onSubmit,
}: {
	pending: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Create Campaign</CardTitle>
				<CardDescription>Create a draft campaign in Listmonk.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-3" onSubmit={onSubmit}>
					<Field name="name" label="Name" />
					<Field name="subject" label="Subject" />
					<Field name="listIds" label="List IDs" placeholder="1, 2, 3" />
					<Label
						htmlFor="campaign-body"
						className="flex flex-col gap-1.5 text-xs font-medium"
					>
						HTML Body
						<Textarea id="campaign-body" name="body" required />
					</Label>
					<Button type="submit" disabled={pending}>
						<Icon icon={Add} data-icon="inline-start" />
						Create
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function TestSendForm({
	pending,
	onSubmit,
}: {
	pending: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Send Test</CardTitle>
				<CardDescription>
					Send only to explicit test recipients.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-3" onSubmit={onSubmit}>
					<Field name="campaignId" label="Campaign ID" type="number" />
					<Field
						name="recipients"
						label="Recipients"
						placeholder="owner@example.com, qa@example.com"
					/>
					<Button type="submit" disabled={pending}>
						<Icon icon={Send} data-icon="inline-start" />
						Send Test
					</Button>
				</form>
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

function EmailCampaignRow({
	campaign,
	onRequestApproval,
	disabled,
}: {
	campaign: EmailCampaign;
	onRequestApproval: () => void;
	disabled: boolean;
}) {
	return (
		<article className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="truncate font-medium">{campaign.name}</h2>
					<Badge variant="outline">{campaign.status}</Badge>
				</div>
				<p className="mt-1 truncate text-muted-foreground text-sm">
					{campaign.subject ?? <EmptyCellValue />}
				</p>
				<div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
					<Metric label="Sent" value={campaign.sent} />
					<Metric label="Opens" value={campaign.opens} />
					<Metric label="Clicks" value={campaign.clicks} />
					<Metric label="Unsubscribes" value={campaign.unsubscribes} />
				</div>
			</div>
			<Button variant="outline" onClick={onRequestApproval} disabled={disabled}>
				<Icon icon={Send} data-icon="inline-start" />
				Request Send
			</Button>
		</article>
	);
}

function AdsCampaignRow({
	campaign,
	onPause,
	disabled,
}: {
	campaign: AdsCampaign;
	onPause: () => void;
	disabled: boolean;
}) {
	return (
		<article className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="truncate font-medium">{campaign.name}</h2>
					<Badge variant="outline">{campaign.status}</Badge>
					{campaign.type ? (
						<Badge variant="secondary">{campaign.type}</Badge>
					) : null}
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
					<Metric label="Spend" value={campaign.spendMicros} suffix="micros" />
					<Metric label="Impressions" value={campaign.impressions} />
					<Metric label="Clicks" value={campaign.clicks} />
					<Metric label="Leads" value={campaign.conversions} />
					<Metric label="ROAS" value={campaign.roas} />
				</div>
			</div>
			<Button variant="outline" onClick={onPause} disabled={disabled}>
				Request Pause
			</Button>
		</article>
	);
}

function ListBlock({
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

function Field({
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

function Metric({
	label,
	value,
	suffix,
}: {
	label: string;
	value: number | null;
	suffix?: string;
}) {
	return (
		<div className="rounded-md bg-muted px-2.5 py-2">
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-1 font-medium tabular-nums">
				{value === null
					? "—"
					: `${formatNumber(value)}${suffix ? ` ${suffix}` : ""}`}
			</p>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
	return (
		<div className="flex min-w-0 justify-between gap-3 border-b py-2 last:border-b-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right">{value ?? <EmptyCellValue />}</span>
		</div>
	);
}

function integrationTone(status: string): StatusTone {
	if (status === "CONNECTED") return "success";
	if (status === "NEEDS_ATTENTION") return "warning";
	return "neutral";
}

function providerLabel(provider: AdsProvider): string {
	return provider === "GOOGLE_ADS" ? "Google Ads" : "Meta Ads";
}

function formatMetric(metric: { value: number | null; unit: string }): string {
	if (metric.value === null) return "—";
	if (metric.unit === "ratio") return metric.value.toFixed(2);
	return formatNumber(metric.value);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
	}).format(value);
}

function required(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, name: string): string | undefined {
	const value = required(form, name);
	return value || undefined;
}

function parseIds(value: string): number[] {
	return splitList(value)
		.map((item) => Number(item))
		.filter((item) => Number.isInteger(item) && item > 0);
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}
