"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import Edit from "@carbon/icons-react/es/Edit";
import Email from "@carbon/icons-react/es/Email";
import Flag from "@carbon/icons-react/es/Flag";
import MailAll from "@carbon/icons-react/es/MailAll";
import Send from "@carbon/icons-react/es/Send";
import Star from "@carbon/icons-react/es/Star";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useState } from "react";
import { ComposeEmail } from "./compose-email";
import type { LabelNode, MailboxLabel } from "./mailbox-labels";
import { buildLabelTree, systemLabelById } from "./mailbox-labels";
import type { MailboxViewId } from "./mailbox-search-params";

type SystemView = {
	id: MailboxViewId;
	label: string;
	gmailLabelId: string;
	icon: typeof Email;
	count: "unread" | "total" | null;
};

const SYSTEM_VIEWS: SystemView[] = [
	{
		id: "inbox",
		label: "Inbox",
		gmailLabelId: "INBOX",
		icon: Email,
		count: "unread",
	},
	{
		id: "starred",
		label: "Starred",
		gmailLabelId: "STARRED",
		icon: Star,
		count: null,
	},
	{
		id: "sent",
		label: "Sent",
		gmailLabelId: "SENT",
		icon: Send,
		count: null,
	},
	{
		id: "drafts",
		label: "Drafts",
		gmailLabelId: "DRAFT",
		icon: Edit,
		count: "total",
	},
	{
		id: "important",
		label: "Important",
		gmailLabelId: "IMPORTANT",
		icon: Flag,
		count: null,
	},
	{
		id: "all",
		label: "All Mail",
		gmailLabelId: "",
		icon: MailAll,
		count: null,
	},
	{
		id: "spam",
		label: "Spam",
		gmailLabelId: "SPAM",
		icon: WarningAlt,
		count: null,
	},
	{
		id: "trash",
		label: "Trash",
		gmailLabelId: "TRASH",
		icon: TrashCan,
		count: null,
	},
];

export function MailboxNav({
	labels,
	activeView,
	activeLabel,
	onNavigate,
}: {
	labels: readonly MailboxLabel[];
	activeView: MailboxViewId | null;
	activeLabel: string | null;
	onNavigate: (target: { view?: MailboxViewId; label?: string }) => void;
}) {
	const nodes = buildLabelTree(labels);

	return (
		<nav aria-label="Mailbox" className="flex min-h-0 flex-col gap-4">
			<div>
				<ComposeEmail />
			</div>

			<ul className="flex flex-col">
				{SYSTEM_VIEWS.map((view) => {
					const label = view.gmailLabelId
						? systemLabelById(labels, view.gmailLabelId)
						: null;
					const count =
						view.count === "unread"
							? (label?.messagesUnread ?? null)
							: view.count === "total"
								? (label?.messagesTotal ?? null)
								: null;

					return (
						<li key={view.id}>
							<NavRow
								active={activeView === view.id && !activeLabel}
								icon={view.icon}
								label={view.label}
								count={count}
								onClick={() => onNavigate({ view: view.id })}
							/>
						</li>
					);
				})}
			</ul>

			{nodes.length > 0 ? (
				<div className="flex min-h-0 flex-col gap-1">
					<p className="px-2 font-medium text-muted-foreground text-xs">
						Labels
					</p>
					<ul className="flex min-h-0 flex-col overflow-y-auto">
						{nodes.map((node) => (
							<LabelNodeRow
								key={node.label.id}
								node={node}
								depth={0}
								activeLabel={activeLabel}
								onNavigate={onNavigate}
							/>
						))}
					</ul>
				</div>
			) : null}
		</nav>
	);
}

function LabelNodeRow({
	node,
	depth,
	activeLabel,
	onNavigate,
}: {
	node: LabelNode;
	depth: number;
	activeLabel: string | null;
	onNavigate: (target: { label: string }) => void;
}) {
	const [open, setOpen] = useState(false);
	const isVirtual = node.label.gmailLabelId === "";
	const active =
		activeLabel !== null && activeLabel === node.label.gmailLabelId;

	const row = (
		<NavRow
			active={active}
			label={node.segment}
			count={node.label.messagesUnread}
			color={node.label.colorBackground}
			depth={depth}
			onClick={() => {
				if (isVirtual) {
					setOpen((value) => !value);
					return;
				}
				onNavigate({ label: node.label.gmailLabelId });
			}}
		/>
	);

	if (node.children.length === 0) return <li>{row}</li>;

	return (
		<li>
			<Collapsible open={open} onOpenChange={setOpen}>
				<div className="flex items-center">
					<CollapsibleTrigger
						aria-label={
							open ? `Collapse ${node.segment}` : `Expand ${node.segment}`
						}
						className="rounded-sm p-1 text-muted-foreground hover:bg-muted"
					>
						<Icon icon={open ? ChevronDown : ChevronRight} size={16} />
					</CollapsibleTrigger>
					<div className="min-w-0 flex-1">{row}</div>
				</div>
				<CollapsibleContent>
					<ul>
						{node.children.map((child) => (
							<LabelNodeRow
								key={child.label.id}
								node={child}
								depth={depth + 1}
								activeLabel={activeLabel}
								onNavigate={onNavigate}
							/>
						))}
					</ul>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

function NavRow({
	active,
	icon: IconComponent,
	label,
	count,
	color,
	depth = 0,
	onClick,
}: {
	active: boolean;
	icon?: typeof Email;
	label: string;
	count: number | null;
	color?: string | null;
	depth?: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-current={active ? "true" : undefined}
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
				active
					? "bg-muted font-medium text-foreground"
					: "text-muted-foreground hover:bg-muted",
			)}
			style={depth > 0 ? { paddingLeft: `${depth * 16 + 8}px` } : undefined}
		>
			{IconComponent ? (
				<Icon icon={IconComponent} size={16} className="shrink-0" />
			) : (
				<span
					aria-hidden
					className="size-2 shrink-0 rounded-sm"
					style={color ? { backgroundColor: color } : undefined}
				/>
			)}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count !== null && count > 0 ? (
				<span className="shrink-0 text-xs">{count}</span>
			) : null}
		</button>
	);
}
