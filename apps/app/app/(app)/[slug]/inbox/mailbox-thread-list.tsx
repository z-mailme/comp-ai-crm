"use client";

import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import FlagFilled from "@carbon/icons-react/es/FlagFilled";
import Search from "@carbon/icons-react/es/Search";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import { authClient } from "@crm/auth/client";
import {
	GMAIL_MODIFY_SCOPE,
	GMAIL_SEND_SCOPE,
	SYNC_SCOPES,
} from "@crm/auth/scopes";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { MailboxLabel } from "./mailbox-labels";
import type { MailboxParams } from "./mailbox-search-params";

type ThreadRow = RouterOutputs["google"]["mailboxThreads"]["rows"][number];
type MailboxAction = RouterOutputs["google"]["mailboxAction"];

export function MailboxThreadList({
	params,
	labels,
	selectedThreadId,
	onSelect,
	onSearch,
	onToggleFilter,
}: {
	params: MailboxParams;
	labels: ReadonlyMap<string, MailboxLabel>;
	selectedThreadId: string | null;
	onSelect: (emailThreadId: string) => void;
	onSearch: (q: string) => void;
	onToggleFilter: (filter: "unread" | "starred") => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [searchText, setSearchText] = useState(params.q);
	const [scopeRequired, setScopeRequired] = useState(false);
	const [granting, setGranting] = useState(false);

	const cursor = cursorStack.at(-1) ?? null;

	const threadsOptions = trpc.google.mailboxThreads.queryOptions({
		view: params.view,
		labelId: params.label ?? undefined,
		q: params.q || undefined,
		unreadOnly: params.unread,
		starredOnly: params.starred,
		cursor: cursor ?? undefined,
		limit: 50,
	});
	const threadsQuery = useQuery(threadsOptions);

	const rows = threadsQuery.data?.rows ?? [];
	const nextCursor = threadsQuery.data?.nextCursor ?? null;

	const userLabels = [...labels.values()].filter(
		(label) => label.type === "user",
	);

	async function invalidateMailbox() {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.google.mailboxThreads.pathKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.google.gmailLabels.queryKey(),
			}),
		]);
	}

	const action = useMutation(
		trpc.google.mailboxAction.mutationOptions({
			onMutate: async (input) => {
				await queryClient.cancelQueries({
					queryKey: trpc.google.mailboxThreads.pathKey(),
				});
				const previous = queryClient.getQueryData(threadsOptions.queryKey);
				queryClient.setQueryData(
					threadsOptions.queryKey,
					(current: RouterOutputs["google"]["mailboxThreads"] | undefined) => {
						if (!current) return current;
						return {
							...current,
							rows: current.rows.map((row) =>
								selected.has(row.providerThreadId)
									? optimisticRow(row, input.action)
									: row,
							),
						};
					},
				);
				return { previous };
			},
			onError: (error, _input, context) => {
				if (context?.previous) {
					queryClient.setQueryData(threadsOptions.queryKey, context.previous);
				}
				toast.error(error.message || "The action failed.");
			},
			onSuccess: async (result: MailboxAction) => {
				if (result.status === "scope-required") {
					setScopeRequired(true);
					return;
				}
				if (result.status === "applied") {
					toast.success(`${result.modified} messages updated.`);
					setSelected(new Set());
					return;
				}
				toast.error(result.reason ?? "The action failed.");
			},
			onSettled: async () => {
				await invalidateMailbox();
			},
		}),
	);

	function act(input: {
		action:
			| "markRead"
			| "markUnread"
			| "star"
			| "unstar"
			| "important"
			| "unimportant"
			| "archive"
			| "moveToInbox"
			| "spam"
			| "notSpam"
			| "trash"
			| "untrash"
			| "applyLabel"
			| "removeLabel";
		labelId?: string;
	}) {
		action.mutate({
			action: input.action,
			providerThreadIds: [...selected],
			labelId: input.labelId,
		});
	}

	async function handleGrant() {
		setGranting(true);
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES, GMAIL_SEND_SCOPE, GMAIL_MODIFY_SCOPE],
			callbackURL: window.location.href,
			errorCallbackURL: window.location.href,
		});
		if (error) {
			setGranting(false);
			toast.error(error.message);
		}
	}

	return (
		<section
			aria-label="Threads"
			className="flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<form
					className="flex min-w-0 flex-1 items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						onSearch(searchText.trim());
					}}
				>
					<Icon
						icon={Search}
						size={16}
						className="shrink-0 text-muted-foreground"
					/>
					<Input
						type="search"
						value={searchText}
						onChange={(event) => setSearchText(event.target.value)}
						placeholder="Search mail"
						aria-label="Search mail"
						className="h-8"
					/>
				</form>
				<Button
					type="button"
					variant={params.unread ? "secondary" : "ghost"}
					size="sm"
					aria-pressed={params.unread}
					onClick={() => onToggleFilter("unread")}
				>
					Unread
				</Button>
				<Button
					type="button"
					variant={params.starred ? "secondary" : "ghost"}
					size="sm"
					aria-pressed={params.starred}
					onClick={() => onToggleFilter("starred")}
				>
					Starred
				</Button>
			</div>

			{scopeRequired ? (
				<div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
					<div className="min-w-0 flex-1">
						<p className="font-medium">Additional Gmail permission required</p>
						<p className="text-muted-foreground">
							Mailbox actions need the Gmail modify scope. Your connection and
							synced mail stay intact.
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						disabled={granting}
						onClick={() => {
							handleGrant().catch(() => setGranting(false));
						}}
					>
						{granting ? "Opening Google…" : "Grant modify permission"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setScopeRequired(false)}
					>
						Not now
					</Button>
				</div>
			) : null}

			{selected.size > 0 ? (
				<div
					role="toolbar"
					aria-label="Selected actions"
					className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5 text-sm"
				>
					<span className="pr-1">{selected.size} selected</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "archive" })}
					>
						Archive
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "markRead" })}
					>
						Mark read
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "markUnread" })}
					>
						Mark unread
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "star" })}
					>
						Star
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "spam" })}
					>
						Spam
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => act({ action: "trash" })}
					>
						Trash
					</Button>
					{userLabels.length > 0 ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" variant="ghost" size="sm">
									Label
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								{userLabels.map((label) => (
									<DropdownMenuItem
										key={label.id}
										onClick={() =>
											act({
												action: "applyLabel",
												labelId: label.gmailLabelId,
											})
										}
									>
										{label.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setSelected(new Set())}
					>
						Clear
					</Button>
				</div>
			) : null}

			{threadsQuery.isPending ? (
				<div className="flex flex-1 items-center justify-center py-12">
					<Spinner />
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center px-6 py-12">
					<p className="text-muted-foreground text-sm">
						No conversations here.
					</p>
				</div>
			) : (
				<ul
					aria-label="Conversations"
					className="min-h-0 flex-1 overflow-y-auto"
				>
					{rows.map((row) => (
						<ThreadListRow
							key={row.providerThreadId}
							row={row}
							labels={labels}
							selected={selected.has(row.providerThreadId)}
							active={selectedThreadId === row.emailThreadId}
							onToggleSelect={() =>
								setSelected((current) => {
									const next = new Set(current);
									if (next.has(row.providerThreadId)) {
										next.delete(row.providerThreadId);
									} else {
										next.add(row.providerThreadId);
									}
									return next;
								})
							}
							onOpen={() => onSelect(row.emailThreadId)}
						/>
					))}
				</ul>
			)}

			<div className="flex items-center justify-end gap-1 border-t px-3 py-1.5">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={cursorStack.length <= 1}
					onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
				>
					<Icon icon={ChevronLeft} size={16} />
					Newer
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={!nextCursor}
					onClick={() => setCursorStack((stack) => [...stack, nextCursor])}
				>
					Older
					<Icon icon={ChevronRight} size={16} />
				</Button>
			</div>
		</section>
	);
}

function ThreadListRow({
	row,
	labels,
	selected,
	active,
	onToggleSelect,
	onOpen,
}: {
	row: ThreadRow;
	labels: ReadonlyMap<string, MailboxLabel>;
	selected: boolean;
	active: boolean;
	onToggleSelect: () => void;
	onOpen: () => void;
}) {
	return (
		<li
			aria-current={active ? "true" : undefined}
			className={cn(
				"flex items-center gap-2 border-b px-3 py-2",
				active && "bg-muted",
				row.unread ? "bg-background" : "bg-transparent",
			)}
		>
			<Checkbox
				checked={selected}
				onCheckedChange={onToggleSelect}
				aria-label={`Select conversation ${row.subject ?? "without subject"}`}
			/>

			<Icon
				icon={row.starred ? StarFilled : Star}
				size={16}
				className={cn(
					"shrink-0",
					row.starred ? "text-foreground" : "text-muted-foreground/50",
				)}
				aria-label={row.starred ? "Starred" : "Not starred"}
			/>

			{row.important ? (
				<Icon
					icon={FlagFilled}
					size={14}
					className="shrink-0 text-foreground"
					aria-label="Important"
				/>
			) : null}

			<button
				type="button"
				onClick={onOpen}
				className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm text-left outline-none focus-visible:bg-muted"
			>
				<span
					className={cn(
						"w-28 shrink-0 truncate text-sm md:w-40",
						row.unread
							? "font-semibold text-foreground"
							: "text-muted-foreground",
					)}
				>
					{row.fromName ?? row.fromEmail}
				</span>

				<span
					className={cn(
						"min-w-0 flex-1 truncate text-sm",
						row.unread
							? "font-semibold text-foreground"
							: "text-muted-foreground",
					)}
				>
					{row.subject ?? "(no subject)"}
					<span className="font-normal text-muted-foreground">
						{" — "}
						{row.snippet ?? ""}
					</span>
				</span>

				{row.userLabelIds.length > 0 ? (
					<span className="hidden shrink-0 items-center gap-1 xl:flex">
						{row.userLabelIds.slice(0, 3).map((labelId) => (
							<LabelChip
								key={labelId}
								label={labels.get(labelId)}
								labelId={labelId}
							/>
						))}
					</span>
				) : null}

				{row.messageCount > 1 ? (
					<span className="shrink-0 text-muted-foreground text-xs">
						{row.messageCount}
					</span>
				) : null}

				<span className="shrink-0 text-muted-foreground text-xs">
					<LocalRelativeTime date={row.lastMessageAt} />
				</span>
			</button>
		</li>
	);
}

function LabelChip({
	label,
	labelId,
}: {
	label: MailboxLabel | undefined;
	labelId: string;
}) {
	return (
		<span
			className="rounded-sm border px-1 py-0.5 text-muted-foreground text-xs"
			style={
				label?.colorBackground
					? {
							backgroundColor: label.colorBackground,
							color: label.colorText ?? undefined,
							borderColor: label.colorBackground,
						}
					: undefined
			}
		>
			{label?.name ?? labelId}
		</span>
	);
}

function optimisticRow(row: ThreadRow, action: string): ThreadRow {
	switch (action) {
		case "markRead":
			return { ...row, unread: false };
		case "markUnread":
			return { ...row, unread: true };
		case "star":
			return { ...row, starred: true };
		case "unstar":
			return { ...row, starred: false };
		case "important":
			return { ...row, important: true };
		case "unimportant":
			return { ...row, important: false };
		default:
			return row;
	}
}
