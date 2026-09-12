"use client";

import Add from "@carbon/icons-react/es/Add";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { StatGroup } from "@crm/ui/components/dashboard";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { TableCell } from "@crm/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Account = RouterOutputs["marketingSocial"]["accounts"]["rows"][number];
type Post = RouterOutputs["marketingSocial"]["posts"]["rows"][number];
type CalendarItem =
	RouterOutputs["marketingSocial"]["calendar"]["items"][number];

const POST_STATUS_LABELS = {
	DRAFT: "Draft",
	PENDING_APPROVAL: "Awaiting approval",
	APPROVED: "Approved",
	SCHEDULED: "Scheduled",
	PUBLISHING: "Publishing",
	PUBLISHED: "Published",
	FAILED: "Failed",
	CANCELLED: "Cancelled",
} satisfies Record<Post["status"], string>;

const PROVIDER_OPTIONS = [
	["META_FACEBOOK", "Facebook Page"],
	["META_INSTAGRAM", "Instagram Professional"],
] as const;

const POST_COLUMNS = [
	{ id: "caption", header: "Post" },
	{ id: "status", header: "Status", width: "8rem" },
	{ id: "accounts", header: "Accounts" },
	{ id: "scheduled", header: "Scheduled", width: "9rem" },
	{ id: "actions", header: "", width: "16rem" },
];

export function SocialView() {
	const trpc = useTRPC();
	const accounts = useQuery(trpc.marketingSocial.accounts.queryOptions({}));
	const posts = useQuery(trpc.marketingSocial.posts.queryOptions({}));
	const inbox = useQuery(trpc.marketingSocial.inbox.queryOptions({}));

	if (
		accounts.isPending ||
		posts.isPending ||
		inbox.isPending ||
		!accounts.data ||
		!posts.data ||
		!inbox.data
	) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<Tabs defaultValue="overview">
			<TabsList>
				<TabsTrigger value="overview">Overview</TabsTrigger>
				<TabsTrigger value="calendar">Calendar</TabsTrigger>
				<TabsTrigger value="posts">Posts</TabsTrigger>
				<TabsTrigger value="accounts">Accounts</TabsTrigger>
				<TabsTrigger value="performance">Performance</TabsTrigger>
			</TabsList>

			<TabsContent value="overview">
				<OverviewTab
					accounts={accounts.data.rows}
					posts={posts.data.rows}
					inboxAvailable={inbox.data.available}
					inboxCount={inbox.data.rows.length}
				/>
			</TabsContent>
			<TabsContent value="calendar">
				<CalendarTab />
			</TabsContent>
			<TabsContent value="posts">
				<PostsTab posts={posts.data.rows} accounts={accounts.data.rows} />
			</TabsContent>
			<TabsContent value="accounts">
				<AccountsTab accounts={accounts.data.rows} />
			</TabsContent>
			<TabsContent value="performance">
				<PerformanceTab accounts={accounts.data.rows} />
			</TabsContent>
		</Tabs>
	);
}

function OverviewTab({
	accounts,
	posts,
	inboxAvailable,
	inboxCount,
}: {
	accounts: Account[];
	posts: Post[];
	inboxAvailable: boolean;
	inboxCount: number;
}) {
	const connected = accounts.filter(
		(account) => account.status === "CONNECTED",
	).length;
	const scheduled = posts.filter((post) => post.status === "SCHEDULED").length;
	const awaiting = posts.filter(
		(post) => post.status === "PENDING_APPROVAL",
	).length;
	const published = posts.filter((post) => post.status === "PUBLISHED").length;

	return (
		<div className="flex flex-col gap-4 pt-4">
			<StatGroup>
				<StatCard label="Connected accounts" value={String(connected)} />
				<StatCard label="Scheduled posts" value={String(scheduled)} />
				<StatCard label="Awaiting approval" value={String(awaiting)} />
				<StatCard label="Published" value={String(published)} />
			</StatGroup>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Social inbox</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground text-sm">
					{inboxAvailable
						? inboxCount === 0
							? "The inbox architecture is ready. Comments, mentions and messages will appear here once provider sync is connected."
							: `${inboxCount} interactions waiting.`
						: "Connect a social account to prepare the inbox. No messaging integration is faked — interactions arrive only through verified provider APIs."}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Publishing policy</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground text-sm">
					Approval is required before anything publishes. Automated publishing
					stays off in this milestone; approved posts wait for the n8n execution
					layer.
				</CardContent>
			</Card>
		</div>
	);
}

function CalendarTab() {
	const trpc = useTRPC();
	const [cursor, setCursor] = useState(() => new Date());
	const [view, setView] = useState<"month" | "agenda">("month");

	const range = monthRange(cursor, view);
	const calendar = useQuery(
		trpc.marketingSocial.calendar.queryOptions({
			from: range.from.toISOString(),
			to: range.to.toISOString(),
		}),
	);

	if (calendar.isPending || !calendar.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 pt-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCursor(shiftMonth(cursor, -1))}
					>
						Previous
					</Button>
					<span className="min-w-40 text-center font-medium text-sm">
						{cursor.toLocaleDateString(undefined, {
							month: "long",
							year: "numeric",
						})}
					</span>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCursor(shiftMonth(cursor, 1))}
					>
						Next
					</Button>
				</div>
				<Select
					value={view}
					onValueChange={(value) => setView(value as "month" | "agenda")}
				>
					<SelectTrigger className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="month">Month</SelectItem>
						<SelectItem value="agenda">Agenda</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{view === "month" ? (
				<MonthGrid cursor={cursor} items={calendar.data.items} />
			) : (
				<AgendaList items={calendar.data.items} />
			)}
		</div>
	);
}

function MonthGrid({ cursor, items }: { cursor: Date; items: CalendarItem[] }) {
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const first = new Date(year, month, 1);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const leading = (first.getDay() + 6) % 7;

	const cells: (Date | null)[] = [];
	for (let index = 0; index < leading; index += 1) cells.push(null);
	for (let day = 1; day <= daysInMonth; day += 1) {
		cells.push(new Date(year, month, day));
	}

	const byDay = new Map<string, CalendarItem[]>();
	for (const item of items) {
		const key = dayKey(new Date(item.at));
		const list = byDay.get(key) ?? [];
		list.push(item);
		byDay.set(key, list);
	}

	return (
		<div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
			{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
				<div
					key={day}
					className="bg-muted px-2 py-1 font-medium text-muted-foreground text-xs"
				>
					{day}
				</div>
			))}
			{cells.map((date, index) => (
				<div
					key={date ? date.toISOString() : `empty-${index}`}
					className="min-h-24 bg-card p-1.5"
				>
					{date ? (
						<>
							<p className="text-muted-foreground text-xs">{date.getDate()}</p>
							<div className="mt-1 flex flex-col gap-1">
								{(byDay.get(dayKey(date)) ?? []).slice(0, 3).map((item) => (
									<CalendarChip key={`${item.kind}-${item.id}`} item={item} />
								))}
								{(byDay.get(dayKey(date)) ?? []).length > 3 ? (
									<p className="text-muted-foreground text-xs">
										+{(byDay.get(dayKey(date)) ?? []).length - 3} more
									</p>
								) : null}
							</div>
						</>
					) : null}
				</div>
			))}
		</div>
	);
}

function CalendarChip({ item }: { item: CalendarItem }) {
	return (
		<div
			className="truncate rounded border bg-background px-1.5 py-0.5 text-xs"
			title={item.title}
		>
			<span className="font-medium">{kindLabel(item.kind)}</span>{" "}
			{new Date(item.at).toLocaleTimeString(undefined, {
				hour: "2-digit",
				minute: "2-digit",
			})}{" "}
			· {item.title}
		</div>
	);
}

function AgendaList({ items }: { items: CalendarItem[] }) {
	if (items.length === 0) {
		return (
			<p className="p-6 text-muted-foreground text-sm">
				Nothing scheduled in this window.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{items.map((item) => (
				<div
					key={`${item.kind}-${item.id}`}
					className="flex items-center justify-between gap-3 rounded-md border p-3"
				>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{item.title}</p>
						<p className="text-muted-foreground text-xs">
							{kindLabel(item.kind)} · {item.status}
						</p>
					</div>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{new Date(item.at).toLocaleString(undefined, {
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				</div>
			))}
		</div>
	);
}

function PostsTab({ posts, accounts }: { posts: Post[]; accounts: Account[] }) {
	return (
		<div className="flex flex-col gap-4 pt-4">
			<div className="flex justify-end">
				<NewPostDialog accounts={accounts} />
			</div>
			<Card className="min-w-0">
				<CardContent className="p-0">
					{posts.length === 0 ? (
						<p className="p-6 text-muted-foreground text-sm">
							No posts yet. Draft one and send it through approval.
						</p>
					) : (
						<SimpleTable columns={POST_COLUMNS} surface="page">
							{posts.map((post) => (
								<PostRow key={post.id} post={post} />
							))}
						</SimpleTable>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function PostRow({ post }: { post: Post }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidate = async () => {
		await queryClient.invalidateQueries();
	};

	const submit = useMutation(
		trpc.marketingSocial.submitForApproval.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Sent for approval.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const decide = useMutation(
		trpc.marketingSocial.decide.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Decision recorded.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const publish = useMutation(
		trpc.marketingSocial.publish.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);
	const cancel = useMutation(
		trpc.marketingSocial.cancel.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Post cancelled.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<SimpleTableRow>
			<TableCell>
				<p className="line-clamp-2 max-w-md text-sm">{post.caption}</p>
				{post.error ? (
					<p className="mt-0.5 text-destructive text-xs">{post.error}</p>
				) : null}
			</TableCell>
			<TableCell>
				<Badge variant="outline">{POST_STATUS_LABELS[post.status]}</Badge>
			</TableCell>
			<TableCell className="text-xs">
				{post.targets.map((target) => target.accountName).join(", ")}
			</TableCell>
			<TableCell className="text-xs tabular-nums">
				{post.scheduledAt
					? new Date(post.scheduledAt).toLocaleString(undefined, {
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})
					: "—"}
			</TableCell>
			<TableCell>
				<div className="flex flex-wrap gap-1">
					{post.status === "DRAFT" || post.status === "CANCELLED" ? (
						<Button
							size="sm"
							variant="outline"
							disabled={submit.isPending}
							onClick={() => submit.mutate({ id: post.id })}
						>
							To approval
						</Button>
					) : null}
					{post.status === "PENDING_APPROVAL" ? (
						<>
							<Button
								size="sm"
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({ id: post.id, decision: "APPROVE" })
								}
							>
								Approve
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({ id: post.id, decision: "REJECT" })
								}
							>
								Reject
							</Button>
						</>
					) : null}
					{post.status === "APPROVED" || post.status === "SCHEDULED" ? (
						<Button
							size="sm"
							variant="outline"
							disabled={publish.isPending}
							onClick={() => publish.mutate({ id: post.id })}
						>
							Publish now
						</Button>
					) : null}
					{post.status !== "PUBLISHED" &&
					post.status !== "CANCELLED" &&
					post.status !== "FAILED" ? (
						<Button
							size="sm"
							variant="ghost"
							disabled={cancel.isPending}
							onClick={() => cancel.mutate({ id: post.id })}
						>
							Cancel
						</Button>
					) : null}
				</div>
			</TableCell>
		</SimpleTableRow>
	);
}

function NewPostDialog({ accounts }: { accounts: Account[] }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [caption, setCaption] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [scheduleAt, setScheduleAt] = useState("");

	const create = useMutation(
		trpc.marketingSocial.createPost.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setOpen(false);
				setCaption("");
				setSelected([]);
				setScheduleAt("");
				toast.success("Post drafted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const connectable = accounts.filter(
		(account) => account.status === "CONNECTED",
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Icon icon={Add} data-icon="inline-start" />
					New post
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New social post</DialogTitle>
					<DialogDescription>
						Drafts go through approval before anything can publish.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="caption">Caption</Label>
						<Textarea
							id="caption"
							rows={4}
							value={caption}
							onChange={(event) => setCaption(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Accounts</Label>
						{connectable.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Connect an account first.
							</p>
						) : (
							connectable.map((account) => (
								<label
									key={account.id}
									htmlFor={`account-${account.id}`}
									className="flex items-center gap-1.5 text-sm"
								>
									<Checkbox
										id={`account-${account.id}`}
										checked={selected.includes(account.id)}
										onCheckedChange={(checked) =>
											setSelected((current) =>
												checked
													? [...current, account.id]
													: current.filter((entry) => entry !== account.id),
											)
										}
									/>
									{account.displayName} ({account.providerLabel})
								</label>
							))
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="postScheduleAt">Schedule for (optional)</Label>
						<Input
							id="postScheduleAt"
							type="datetime-local"
							value={scheduleAt}
							onChange={(event) => setScheduleAt(event.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={
							create.isPending || !caption.trim() || selected.length === 0
						}
						onClick={() =>
							create.mutate({
								caption: caption.trim(),
								accountIds: selected,
								scheduledAt: scheduleAt
									? new Date(scheduleAt).toISOString()
									: null,
							})
						}
					>
						Create draft
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AccountsTab({ accounts }: { accounts: Account[] }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [provider, setProvider] = useState<string>("META_FACEBOOK");
	const [accountId, setAccountId] = useState("");
	const [name, setName] = useState("");
	const [token, setToken] = useState("");

	const register = useMutation(
		trpc.marketingSocial.registerAccount.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setOpen(false);
				setAccountId("");
				setName("");
				setToken("");
				toast.success("Account connected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const disconnect = useMutation(
		trpc.marketingSocial.disconnectAccount.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Account disconnected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="flex flex-col gap-4 pt-4">
			<div className="flex justify-end">
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<Icon icon={Add} data-icon="inline-start" />
							Connect account
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Connect a social account</DialogTitle>
							<DialogDescription>
								Meta first. Tokens are stored server-side and never shown again.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-1.5">
								<Label>Provider</Label>
								<Select value={provider} onValueChange={setProvider}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PROVIDER_OPTIONS.map(([value, label]) => (
											<SelectItem key={value} value={value}>
												{label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="externalAccountId">Account ID</Label>
								<Input
									id="externalAccountId"
									value={accountId}
									onChange={(event) => setAccountId(event.target.value)}
									placeholder="Page or professional account id"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="displayName">Display name</Label>
								<Input
									id="displayName"
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="accessToken">Access token</Label>
								<Input
									id="accessToken"
									type="password"
									value={token}
									onChange={(event) => setToken(event.target.value)}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								disabled={
									register.isPending ||
									!accountId.trim() ||
									!name.trim() ||
									!token.trim()
								}
								onClick={() =>
									register.mutate({
										provider: provider as Account["provider"],
										externalAccountId: accountId.trim(),
										displayName: name.trim(),
										accessToken: token.trim(),
									})
								}
							>
								Connect
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<Card>
				<CardContent className="p-0">
					{accounts.length === 0 ? (
						<p className="p-6 text-muted-foreground text-sm">
							No accounts connected. Meta (Facebook Pages and Instagram
							Professional) is the first supported provider; LinkedIn, TikTok
							and YouTube follow once verified.
						</p>
					) : (
						<ul className="divide-y">
							{accounts.map((account) => (
								<li
									key={account.id}
									className="flex items-center justify-between gap-3 p-4"
								>
									<div>
										<p className="font-medium text-sm">{account.displayName}</p>
										<p className="text-muted-foreground text-xs">
											{account.providerLabel} · {account.status}
											{account.docsVerified ? "" : " · docs unverified"}
										</p>
									</div>
									{account.status !== "DISCONNECTED" ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={disconnect.isPending}
											onClick={() => disconnect.mutate({ id: account.id })}
										>
											Disconnect
										</Button>
									) : null}
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function PerformanceTab({ accounts }: { accounts: Account[] }) {
	const [range, setRange] = useState("28d");

	return (
		<div className="flex flex-col gap-4 pt-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Real reach, impressions, engagement, likes, comments, shares, clicks
					and video views — only once provider sync is live.
				</p>
				<Select value={range} onValueChange={setRange}>
					<SelectTrigger className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="7d">7 days</SelectItem>
						<SelectItem value="28d">28 days</SelectItem>
						<SelectItem value="90d">90 days</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Card>
				<CardContent className="p-6 text-muted-foreground text-sm">
					{accounts.length === 0
						? "No accounts connected. Performance appears here only from real provider data — nothing is synthesized."
						: `No performance data for the last ${range.replace("d", " days")} yet. Metrics arrive through the provider sync in a later phase.`}
				</CardContent>
			</Card>
		</div>
	);
}

function kindLabel(kind: CalendarItem["kind"]): string {
	if (kind === "SOCIAL_POST") return "Post";
	if (kind === "CONTENT") return "Content";
	return "Campaign";
}

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function shiftMonth(date: Date, delta: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function monthRange(cursor: Date, view: "month" | "agenda") {
	if (view === "agenda") {
		const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);
		return { from, to };
	}
	const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
	const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59);
	return { from, to };
}
