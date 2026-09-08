"use client";

import Menu from "@carbon/icons-react/es/Menu";
import { Button } from "@crm/ui/components/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@crm/ui/components/drawer";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { MailboxConversation } from "./mailbox-conversation";
import { labelsById } from "./mailbox-labels";
import { MailboxNav } from "./mailbox-nav";
import {
	type MailboxParams,
	type MailboxViewId,
	mailboxSearch,
	parseMailboxParams,
} from "./mailbox-search-params";
import { MailboxThreadList } from "./mailbox-thread-list";

export function MailboxWorkspace() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const searchParams = useSearchParams();
	const [navOpen, setNavOpen] = useState(false);

	const params = parseMailboxParams(searchParams);

	const labelsQuery = useQuery(trpc.google.gmailLabels.queryOptions());
	const labels = labelsQuery.data ?? [];
	const labelMap = labelsById(labels);

	function update(patch: Partial<MailboxParams>) {
		const next: MailboxParams = { ...params, ...patch };
		if (patch.view !== undefined || patch.label !== undefined) {
			next.thread = null;
		}
		router.push(workspaceUrl(`/inbox${mailboxSearch(next)}`));
		setNavOpen(false);
	}

	function navigate(target: { view?: MailboxViewId; label?: string }) {
		if (target.view) {
			update({ view: target.view, label: null });
			return;
		}
		if (target.label) {
			update({ label: target.label, view: "inbox" });
		}
	}

	const conversationOpen = params.thread !== null;

	return (
		<div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
			<aside className="hidden w-60 shrink-0 overflow-y-auto border-r p-2 md:block">
				<MailboxNav
					labels={labels}
					activeView={params.label ? null : params.view}
					activeLabel={params.label}
					onNavigate={navigate}
				/>
			</aside>

			<div
				className={cn(
					"min-w-0 flex-1 flex-col md:flex",
					conversationOpen ? "hidden" : "flex",
				)}
			>
				<div className="flex items-center gap-2 border-b px-2 py-1.5 md:hidden">
					<Drawer open={navOpen} onOpenChange={setNavOpen}>
						<DrawerTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label="Open folders"
							>
								<Icon icon={Menu} size={16} />
							</Button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Folders</DrawerTitle>
							</DrawerHeader>
							<div className="max-h-[60dvh] overflow-y-auto p-2">
								<MailboxNav
									labels={labels}
									activeView={params.label ? null : params.view}
									activeLabel={params.label}
									onNavigate={navigate}
								/>
							</div>
						</DrawerContent>
					</Drawer>
				</div>

				<MailboxThreadList
					key={`${params.view}|${params.label}|${params.q}|${params.unread}|${params.starred}`}
					params={params}
					labels={labelMap}
					selectedThreadId={params.thread}
					onSelect={(emailThreadId) => update({ thread: emailThreadId })}
					onSearch={(q) => update({ q })}
					onToggleFilter={(filter) =>
						update(
							filter === "unread"
								? { unread: !params.unread }
								: { starred: !params.starred },
						)
					}
				/>
			</div>

			<div
				className={cn(
					"min-w-0 flex-1 flex-col border-l xl:flex",
					conversationOpen ? "flex" : "hidden",
				)}
			>
				{params.thread ? (
					<MailboxConversation
						threadId={params.thread}
						onBack={() => update({ thread: null })}
					/>
				) : (
					<div className="hidden flex-1 items-center justify-center px-6 xl:flex">
						<p className="text-muted-foreground text-sm">
							Select a conversation to read it.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
