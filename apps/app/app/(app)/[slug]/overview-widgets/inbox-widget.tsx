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
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { formatCount } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";
const COLUMNS: SimpleTableColumn[] = [
	{ id: "conversation", header: "Conversation" },
	{ id: "when", header: "When", width: "w-24", align: "right" },
];

export function InboxUnreadWidget() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const inboxQuery = useQuery(trpc.businessOs.inbox.queryOptions({ limit: 6 }));

	if (inboxQuery.isPending) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Inbox</CardTitle>
					<CardDescription>Unread and recent conversations</CardDescription>
				</CardHeader>
				<div className="flex justify-center border-t py-10">
					<Spinner />
				</div>
			</Card>
		);
	}

	if (inboxQuery.isError || !inboxQuery.data) {
		return (
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Inbox</CardTitle>
					<CardDescription>
						{inboxQuery.error?.message ??
							"Setup required. Connect Gmail to see conversations here."}
					</CardDescription>
					<CardAction>
						<Button asChild variant="outline" size="sm">
							<Link href={`/${slug}/settings/connections/google`}>Connect</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardPanel>
					<CardPanelEmpty>No conversations available.</CardPanelEmpty>
				</CardPanel>
			</Card>
		);
	}

	const conversations = inboxQuery.data.conversations;
	const unread = conversations.reduce(
		(total, conversation) => total + conversation.unreadCount,
		0,
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Inbox</CardTitle>
				<CardDescription>
					{unread > 0
						? `${formatCount(unread, "unread message")} across the latest conversations`
						: "No unread messages in the latest conversations"}
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={`/${slug}/inbox`}>Open inbox</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel>
				{conversations.length === 0 ? (
					<CardPanelEmpty>No conversations yet.</CardPanelEmpty>
				) : (
					<SimpleTable variant="panel" surface="page" columns={COLUMNS}>
						{conversations.map((conversation) => (
							<SimpleTableRow key={conversation.id}>
								<TableCell className={CELL}>
									<span className="flex min-w-0 flex-col">
										<span className="truncate font-medium">
											{conversation.subject ?? "No subject"}
											{conversation.unreadCount > 0 ? (
												<span className="ml-2 text-muted-foreground text-xs">
													{conversation.unreadCount} unread
												</span>
											) : null}
										</span>
										<span className="truncate text-muted-foreground">
											{conversation.preview ?? ""}
										</span>
									</span>
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									{conversation.lastMessageAt ? (
										<LocalRelativeTime date={conversation.lastMessageAt} />
									) : (
										"—"
									)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</CardPanel>
		</Card>
	);
}
