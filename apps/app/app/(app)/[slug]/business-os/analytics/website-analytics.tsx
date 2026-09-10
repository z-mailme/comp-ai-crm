"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardGrid, StatGroup } from "@crm/ui/components/dashboard";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatPercent } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AreaTrend } from "@/components/dashboard-charts";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type GaReport = RouterOutputs["googleAnalytics"]["report"];
type GaReportOk = Extract<GaReport, { state: "ok" }>;

const WINDOWS = [
	{ days: 7, label: "7 days" },
	{ days: 28, label: "28 days" },
	{ days: 90, label: "90 days" },
] as const;

type WindowDays = (typeof WINDOWS)[number]["days"];

const DAILY_CONFIG = {
	users: { label: "Users", color: "var(--chart-1)" },
	sessions: { label: "Sessions", color: "var(--chart-2)" },
	views: { label: "Views", color: "var(--chart-3)" },
};

function formatEngagement(seconds: number | null): string {
	if (seconds == null) return "—";
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	if (minutes === 0) return `${rest}s`;
	return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}

export function WebsiteAnalytics() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const [days, setDays] = useState<WindowDays>(28);

	const reportQuery = useQuery(
		trpc.googleAnalytics.report.queryOptions({ days }),
	);

	const settingsHref = `/${slug}/settings/connections/google`;

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-lg">Website analytics</h2>
					<p className="text-muted-foreground text-sm">
						Google Analytics 4, read-only. Refreshes at most every 15 minutes.
					</p>
				</div>
				<ToggleGroup
					type="single"
					value={String(days)}
					onValueChange={(value) => {
						const next = WINDOWS.find(
							(window) => String(window.days) === value,
						);
						if (next) setDays(next.days);
					}}
				>
					{WINDOWS.map((window) => (
						<ToggleGroupItem key={window.days} value={String(window.days)}>
							{window.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{reportQuery.isPending ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : reportQuery.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Google Analytics could not be loaded</AlertTitle>
					<AlertDescription>{reportQuery.error.message}</AlertDescription>
					<Button
						variant="outline"
						size="sm"
						onClick={() => reportQuery.refetch()}
					>
						Retry
					</Button>
				</Alert>
			) : reportQuery.data.state !== "ok" ? (
				<SetupCard state={reportQuery.data.state} href={settingsHref} />
			) : (
				<ReportView report={reportQuery.data} settingsHref={settingsHref} />
			)}
		</section>
	);
}

function SetupCard({
	state,
	href,
}: {
	state: "unavailable" | "disconnected" | "permission-required" | "no-property";
	href: string;
}) {
	const copy = {
		unavailable: {
			title: "Google sign-in is not configured",
			description:
				"Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env file and restart.",
			action: null,
		},
		disconnected: {
			title: "Google is not connected",
			description: "Connect Google before website analytics can be read.",
			action: "Connect Google",
		},
		"permission-required": {
			title: "Analytics permission required",
			description:
				"Grant the read-only Google Analytics permission. Email and calendar access stay as they are.",
			action: "Grant analytics access",
		},
		"no-property": {
			title: "Choose a GA4 property",
			description:
				"Google Analytics access is granted. Pick the property to report on.",
			action: "Choose property",
		},
	}[state];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{copy.title}</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
				{copy.action ? (
					<CardAction>
						<Button variant="outline" size="sm" asChild>
							<Link href={href}>{copy.action}</Link>
						</Button>
					</CardAction>
				) : null}
			</CardHeader>
		</Card>
	);
}

function ReportView({
	report,
	settingsHref,
}: {
	report: GaReportOk;
	settingsHref: string;
}) {
	const isEmpty =
		report.daily.length === 0 &&
		report.summary.users === 0 &&
		report.summary.sessions === 0;

	return (
		<>
			<StatGroup>
				<StatCard
					label="Users"
					value={report.summary.users.toLocaleString()}
					description={`${report.summary.activeUsers.toLocaleString()} active`}
				/>
				<StatCard
					label="Sessions"
					value={report.summary.sessions.toLocaleString()}
					description={`${report.summary.engagedSessions.toLocaleString()} engaged`}
				/>
				<StatCard
					label="Views"
					value={report.summary.views.toLocaleString()}
					description={`${report.summary.eventCount.toLocaleString()} events`}
				/>
				<StatCard
					label="Engagement rate"
					value={
						report.summary.engagementRate != null
							? formatPercent(report.summary.engagementRate)
							: "—"
					}
					description={`${formatEngagement(report.summary.avgEngagementTimeSeconds)} avg. engagement · ${report.summary.keyEvents.toLocaleString()} key events`}
				/>
			</StatGroup>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>No analytics data in this window</EmptyTitle>
						<EmptyDescription>
							{report.property.name ?? `Property ${report.property.id}`} has not
							recorded traffic for the selected period.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Daily traffic</CardTitle>
							<CardDescription>
								Users, sessions and page views per day ·{" "}
								{report.property.name ?? `Property ${report.property.id}`}
							</CardDescription>
							<CardAction>
								<Button variant="ghost" size="xs" asChild>
									<Link href={settingsHref}>Change property</Link>
								</Button>
							</CardAction>
						</CardHeader>
						<CardContent>
							<AreaTrend
								data={report.daily}
								config={DAILY_CONFIG}
								xKey="date"
								height={240}
								showLegend
								formatX={(value) =>
									new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
									})
								}
							/>
						</CardContent>
					</Card>

					<DashboardGrid columns={2}>
						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Acquisition</CardTitle>
								<CardDescription>
									Where sessions came from, by source and medium.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Source / medium</TableHead>
											<TableHead className="text-right">Users</TableHead>
											<TableHead className="text-right">Sessions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{report.sources.map((row) => (
											<TableRow key={`${row.source}|${row.medium}`}>
												<TableCell>
													{row.source} / {row.medium}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.users.toLocaleString()}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.sessions.toLocaleString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>

						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Top pages</CardTitle>
								<CardDescription>
									Most viewed page paths in the window.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Page</TableHead>
											<TableHead className="text-right">Views</TableHead>
											<TableHead className="text-right">Users</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{report.pages.map((row) => (
											<TableRow key={row.path}>
												<TableCell className="max-w-0 truncate">
													{row.path}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.views.toLocaleString()}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.users.toLocaleString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>

						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Devices</CardTitle>
								<CardDescription>Users by device category.</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Device</TableHead>
											<TableHead className="text-right">Users</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{report.devices.map((row) => (
											<TableRow key={row.category}>
												<TableCell>{row.category}</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.users.toLocaleString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>

						<Card className="min-w-0">
							<CardHeader>
								<CardTitle>Countries</CardTitle>
								<CardDescription>Users by country.</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Country</TableHead>
											<TableHead className="text-right">Users</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{report.countries.map((row) => (
											<TableRow key={row.country}>
												<TableCell>{row.country}</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.users.toLocaleString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</DashboardGrid>
				</>
			)}

			<p className="text-muted-foreground text-xs">
				Generated <LocalDateTime date={report.generatedAt} options={{}} /> · GA4
				property {report.property.id}.
			</p>
		</>
	);
}
