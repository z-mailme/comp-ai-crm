"use client";

import Launch from "@carbon/icons-react/es/Launch";
import Warning from "@carbon/icons-react/es/Warning";
import { authClient } from "@crm/auth/client";
import { SYNC_SCOPES } from "@crm/auth/scopes";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { GoogleAnalyticsConnection } from "./google-analytics-connection";

const SOURCES = {
	calendar: {
		label: "Meetings",
		autoCreate: "Add the company and contact when you meet someone new",
	},
	gmail: {
		label: "Email",
		autoCreate: "Add the company and contact when you reply to someone new",
	},
} as const;

const RESOLVE_HOSTS = [
	"console.cloud.google.com",
	"console.developers.google.com",
	"support.google.com",
	"myaccount.google.com",
];

function resolveLink(error: string): string | undefined {
	const found = error.match(/https?:\/\/[^\s)]+/)?.[0];
	if (!found) return undefined;

	try {
		const url = new URL(found);
		const allowed =
			url.protocol === "https:" &&
			RESOLVE_HOSTS.some(
				(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
			);
		return allowed ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function explain(error: string) {
	return {
		summary: error.split(/(?<=\.)\s/)[0] ?? error,
		url: resolveLink(error),
	};
}

function failureSignature(
	sources: readonly {
		source: string;
		status: string | null;
		lastError: string | null;
	}[],
): string {
	const failures: string[] = [];
	for (const source of sources) {
		if (source.status === "NEEDS_RECONNECT" || source.lastError) {
			failures.push(`${source.source}:${source.lastError ?? "reconnect"}`);
		}
	}
	return failures.sort().join("|");
}

function GoogleUnavailable() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Google
						<StatusIndicator size="sm" tone="neutral" label="Not configured" />
					</div>
				</CardTitle>
				<CardDescription>
					Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env file
					and restart.
				</CardDescription>
			</CardHeader>
		</Card>
	);
}

const CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Google account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Google account that matches your sign-in address.",
	],
]);

const HISTORICAL_IMPORT_ACTIVE = new Set([
	"PLANNING",
	"READY",
	"RUNNING",
	"VERIFYING",
	"WAITING_RATE_LIMIT",
	"WAITING_RETRY",
]);

const IMPORT_DAY_MS = 86_400_000;

const HISTORICAL_IMPORT_LABEL = {
	PLANNING: "Planning",
	READY: "Ready",
	RUNNING: "Running",
	VERIFYING: "Verifying",
	WAITING_RATE_LIMIT: "Waiting for Gmail",
	WAITING_RETRY: "Waiting to retry",
	RECONNECT_REQUIRED: "Needs reconnect",
	PAUSED: "Paused",
	FAILED: "Failed",
	COMPLETED: "Completed",
	CANCELLED: "Cancelled",
} as const;

function ConnectGoogle({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach Google.");
	}

	async function handleConnect() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES],
			callbackURL: `${origin}/${slug}/settings/connections/google`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/google?provider=google`,
		});

		if (error) fail(error.message);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Google
						<StatusIndicator size="sm" tone="neutral" label="Not connected" />
					</div>
				</CardTitle>
				<CardDescription>
					Read-only Gmail and Calendar. Calendar events are stored before CRM
					links exist.
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						disabled={pending}
						onClick={() => {
							handleConnect().catch(() => fail());
						}}
						type="button"
					>
						{pending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<GoogleLogo data-icon="inline-start" className="size-4" />
						)}
						Connect
					</Button>
				</CardAction>
			</CardHeader>

			{connectError ? (
				<CardContent>
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>Google did not finish connecting</AlertTitle>
						<AlertDescription>
							{CONNECT_ERRORS.get(connectError) ??
								"Google returned an error before the connection was made. Try again."}
						</AlertDescription>
					</Alert>
				</CardContent>
			) : null}
		</Card>
	);
}

export function GoogleConnection(props: {
	slug: string;
	connectError?: string;
}) {
	return (
		<div className="flex flex-col gap-6">
			<GoogleMailboxConnection {...props} />
			<GoogleAnalyticsConnection slug={props.slug} />
		</div>
	);
}

function GoogleMailboxConnection({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	const status = useQuery({
		...trpc.google.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some((source) => isSyncing(source.status)) ||
			(query.state.data?.historicalImport
				? HISTORICAL_IMPORT_ACTIVE.has(query.state.data.historicalImport.status)
				: false)
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.google.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.google();
				toast.success(`Removed ${result.purged} synced items.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.google.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : `/${slug}/settings/connections`,
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.google.setAutoCreate.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const [insistence, setInsistence] = useState(0);

	const syncNow = useMutation(
		trpc.google.syncNow.mutationOptions({
			onSuccess: async () => {
				const before = failureSignature(status.data?.sources ?? []);
				await cache.google();

				const after = failureSignature(
					queryClient.getQueryData(trpc.google.status.queryKey())?.sources ??
						[],
				);

				if (after && after === before) setInsistence((count) => count + 1);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reindexCalendar = useMutation(
		trpc.google.reindexCalendar.mutationOptions({
			onSuccess: async () => {
				await cache.google({ settle: "record" });
				toast.success("Calendar reindex is ready for the next check.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) return <GoogleUnavailable />;
	if (!linked) return <ConnectGoogle slug={slug} connectError={connectError} />;

	const failing = sources.filter(
		(source) => source.status === "NEEDS_RECONNECT" || source.lastError,
	);
	const lastSyncedAt = sources
		.map((source) => source.lastSyncedAt)
		.filter((at): at is string => at !== null)
		.sort()
		.at(-1);

	const healthy = failing.length === 0 && hasRefreshToken;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Google
						<StatusIndicator
							size="sm"
							tone={healthy ? "success" : "warning"}
							label={healthy ? "Connected" : "Needs attention"}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					Calendar stores Google events first. CRM links and email threads
					attach when a match exists.
				</CardDescription>

				<CardAction className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={reindexCalendar.isPending}
						onClick={() => reindexCalendar.mutate({})}
					>
						{reindexCalendar.isPending ? "Preparing…" : "Reindex calendar"}
					</Button>
					<Button
						variant="contrast"
						size="sm"
						disabled={syncNow.isPending}
						onClick={() => syncNow.mutate()}
					>
						{syncNow.isPending ? "Checking…" : "Check now"}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{!hasRefreshToken ? (
					<Alert variant="destructive" attention={insistence}>
						<Icon icon={Warning} />
						<AlertTitle>Google did not return a refresh token</AlertTitle>
						<AlertDescription>Sign out and back in.</AlertDescription>
					</Alert>
				) : failing.length > 0 ? (
					failing.map((source) => {
						const { summary, url } = explain(
							source.lastError ?? "Google needs reconnecting.",
						);

						return (
							<Alert
								key={source.source}
								variant="destructive"
								attention={insistence}
							>
								<Icon icon={Warning} />
								<AlertTitle>
									{SOURCES[source.source].label} sync failed
								</AlertTitle>
								<AlertDescription>{summary}</AlertDescription>

								{url ? (
									<AlertAction>
										<Button variant="contrast" size="xs" asChild>
											<a href={url} target="_blank" rel="noreferrer">
												Resolve
												<Icon icon={Launch} data-icon="inline-end" />
											</a>
										</Button>
									</AlertAction>
								) : null}
							</Alert>
						);
					})
				) : (
					<p className="text-muted-foreground text-xs">
						{lastSyncedAt ? (
							<>
								Last checked <LocalRelativeTime date={lastSyncedAt} />
							</>
						) : (
							"Waiting for the first check"
						)}
					</p>
				)}

				{sources.map((source) => {
					const copy = SOURCES[source.source];

					return (
						<div
							key={source.source}
							className="flex items-center justify-between gap-6"
						>
							<Label
								htmlFor={`auto-create-${source.source}`}
								className="flex flex-col items-start gap-1"
							>
								<span className="text-sm">{copy.label}</span>
								<span className="font-normal text-muted-foreground text-xs">
									{copy.autoCreate}
								</span>
							</Label>

							<Switch
								id={`auto-create-${source.source}`}
								checked={source.autoCreate}
								disabled={setAutoCreate.isPending}
								onCheckedChange={(enabled) =>
									setAutoCreate.mutate({ source: source.source, enabled })
								}
							/>
						</div>
					);
				})}

				<HistoricalEmailImport job={status.data.historicalImport} />

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={purge.isPending}>
									Delete synced data
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete synced data?</AlertDialogTitle>
									<AlertDialogDescription>
										Every email and meeting brought in from Google is removed
										from the CRM. The next check starts from now, so nothing
										deleted here comes back.
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => purge.mutate()}
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={revoke.isPending}>
									Revoke Google access
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Revoke Google access?</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? "You will be signed out, and you cannot use the CRM again until you grant access."
											: "New email and meetings stop arriving. Everything already synced stays, and you can connect Google again from this page."}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => revoke.mutate()}
									>
										Revoke
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button variant="ghost" size="xs" asChild>
							<Link
								href="https://myaccount.google.com/permissions"
								target="_blank"
								rel="noreferrer"
							>
								Manage in your Google account
							</Link>
						</Button>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}

type HistoricalImportJob = {
	id: string;
	requestedAfter: string;
	requestedBefore: string;
	status: keyof typeof HISTORICAL_IMPORT_LABEL;
	totalMessages: number;
	processedMessages: number;
	writtenMessages: number;
	alreadyStoredMessages: number;
	ignoredMessages: number;
	remainingMessages: number;
	totalChunks: number;
	completedChunks: number;
	progressPercentage: number;
	retryAfterAt: string | null;
	lastError: string | null;
};

function HistoricalEmailImport({ job }: { job: HistoricalImportJob | null }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");

	const start = useMutation(
		trpc.google.createHistoricalImport.mutationOptions({
			onSuccess: async () => {
				await cache.google({ settle: "record" });
				toast.success("Historical email import started.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const pause = useMutation(
		trpc.google.pauseHistoricalImport.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const resume = useMutation(
		trpc.google.resumeHistoricalImport.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const cancel = useMutation(
		trpc.google.cancelHistoricalImport.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const pending =
		start.isPending || pause.isPending || resume.isPending || cancel.isPending;
	const showStartForm =
		!job || job.status === "COMPLETED" || job.status === "CANCELLED";

	function startImport() {
		if (!startDate || !endDate) {
			toast.error("Choose a start date and an end date.");
			return;
		}

		start.mutate({
			requestedAfter: `${startDate}T00:00:00.000Z`,
			requestedBefore: toExclusiveEnd(endDate).toISOString(),
		});
	}

	return (
		<div className="flex flex-col gap-4 border-t pt-5">
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-4">
					<h3 className="font-medium text-sm">Historical email import</h3>
					{job ? (
						<StatusIndicator
							size="sm"
							tone={statusTone(job.status)}
							label={HISTORICAL_IMPORT_LABEL[job.status]}
						/>
					) : null}
				</div>
				<p className="text-muted-foreground text-xs">
					Import older Gmail messages without moving the live sync cursor.
				</p>
			</div>

			{job ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-4 text-xs">
							<span>
								{formatDate(job.requestedAfter)} →{" "}
								{formatExclusiveEnd(job.requestedBefore)}
							</span>
							<span className="tabular-nums">
								{job.progressPercentage.toFixed(1)}%
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-sm bg-muted">
							<div
								className="h-full bg-primary"
								style={{ width: `${job.progressPercentage}%` }}
							/>
						</div>
					</div>

					<div className="grid gap-3 text-xs sm:grid-cols-3">
						<Metric
							label="Progress"
							value={`${job.processedMessages} / ${job.totalMessages}`}
						/>
						<Metric
							label="Chunks"
							value={`${job.completedChunks} / ${job.totalChunks}`}
						/>
						<Metric label="Written" value={job.writtenMessages.toString()} />
						<Metric
							label="Already stored"
							value={job.alreadyStoredMessages.toString()}
						/>
						<Metric label="Ignored" value={job.ignoredMessages.toString()} />
						<Metric
							label="Remaining"
							value={job.remainingMessages.toString()}
						/>
					</div>

					{job.status === "WAITING_RATE_LIMIT" && job.retryAfterAt ? (
						<Alert>
							<AlertTitle>Waiting for Gmail</AlertTitle>
							<AlertDescription>
								Retrying automatically at{" "}
								{new Date(job.retryAfterAt).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})}
								.
							</AlertDescription>
						</Alert>
					) : null}

					{job.status === "RECONNECT_REQUIRED" ? (
						<Alert variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>Google connection needs reconnecting</AlertTitle>
							<AlertDescription>
								Reconnect Google, then resume this import.
							</AlertDescription>
						</Alert>
					) : null}

					{job.lastError && job.status !== "WAITING_RATE_LIMIT" ? (
						<p className="text-destructive text-xs">{job.lastError}</p>
					) : null}

					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="xs"
							disabled={pending || !canPause(job.status)}
							onClick={() => pause.mutate({ id: job.id })}
						>
							Pause
						</Button>
						<Button
							variant="outline"
							size="xs"
							disabled={pending || !canResume(job.status)}
							onClick={() => resume.mutate({ id: job.id })}
						>
							Resume
						</Button>
						<Button
							variant="ghost"
							size="xs"
							disabled={pending || !canCancel(job.status)}
							onClick={() => cancel.mutate({ id: job.id })}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : null}

			{showStartForm ? (
				<FieldGroup>
					<div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
						<Field>
							<FieldLabel htmlFor="gmail-import-start">Start date</FieldLabel>
							<Input
								id="gmail-import-start"
								type="date"
								value={startDate}
								onChange={(event) => setStartDate(event.target.value)}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="gmail-import-end">End date</FieldLabel>
							<Input
								id="gmail-import-end"
								type="date"
								value={endDate}
								onChange={(event) => setEndDate(event.target.value)}
							/>
						</Field>

						<Button
							type="button"
							size="sm"
							disabled={start.isPending}
							onClick={startImport}
							className="self-end"
						>
							{start.isPending ? <Spinner data-icon="inline-start" /> : null}
							Start import
						</Button>
					</div>
				</FieldGroup>
			) : null}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}

function statusTone(status: keyof typeof HISTORICAL_IMPORT_LABEL) {
	if (status === "COMPLETED") return "success";
	if (
		status === "FAILED" ||
		status === "RECONNECT_REQUIRED" ||
		status === "CANCELLED"
	) {
		return "warning";
	}

	return "neutral";
}

function canPause(status: keyof typeof HISTORICAL_IMPORT_LABEL) {
	return HISTORICAL_IMPORT_ACTIVE.has(status);
}

function canResume(status: keyof typeof HISTORICAL_IMPORT_LABEL) {
	return (
		status === "PAUSED" ||
		status === "FAILED" ||
		status === "RECONNECT_REQUIRED" ||
		status === "WAITING_RETRY"
	);
}

function canCancel(status: keyof typeof HISTORICAL_IMPORT_LABEL) {
	return status !== "COMPLETED" && status !== "CANCELLED";
}

function toExclusiveEnd(value: string): Date {
	const date = new Date(`${value}T00:00:00.000Z`);
	return new Date(date.getTime() + IMPORT_DAY_MS);
}

function formatDate(value: string): string {
	return value.slice(0, 10);
}

function formatExclusiveEnd(value: string): string {
	const date = new Date(value);
	const inclusive = new Date(date.getTime() - IMPORT_DAY_MS);
	return inclusive.toISOString().slice(0, 10);
}
