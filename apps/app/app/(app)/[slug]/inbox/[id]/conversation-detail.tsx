"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { ReplyComposer } from "./reply-composer";

type ConversationDetailOutput = RouterOutputs["businessOs"]["conversation"];
type Message = ConversationDetailOutput["messages"][number];

export function ConversationDetail({ id }: { id: string }) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const detail = useQuery(trpc.businessOs.conversation.queryOptions({ id }));

	if (detail.isPending || !detail.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (detail.isError) {
		return (
			<div className="rounded-lg border bg-card p-6 text-sm">
				<p className="font-medium">Conversation failed to load.</p>
				<p className="mt-1 text-muted-foreground">
					It may have been removed, or the server is unreachable.
				</p>
			</div>
		);
	}

	const { conversation, messages } = detail.data;
	const isEmail = conversation.channel === "EMAIL";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<Button
					asChild
					variant="outline"
					size="icon"
					aria-label="Back to inbox"
				>
					<Link href={workspaceUrl("/inbox")}>
						<Icon icon={ArrowLeft} />
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="truncate font-medium">
						{conversation.subject ?? "Conversation"}
					</h1>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
						<Badge variant="outline">{conversation.channel}</Badge>
						<Badge variant="outline">{conversation.status}</Badge>
						{conversation.contact ? (
							<Link
								href={workspaceUrl(`/contacts/${conversation.contact.id}`)}
								className="hover:text-foreground"
							>
								{conversation.contact.name}
							</Link>
						) : null}
						{conversation.company ? (
							<Link
								href={workspaceUrl(`/companies/${conversation.company.id}`)}
								className="hover:text-foreground"
							>
								{conversation.company.name}
							</Link>
						) : null}
						{conversation.deal ? (
							<Link
								href={workspaceUrl(`/deals/${conversation.deal.id}`)}
								className="hover:text-foreground"
							>
								{conversation.deal.name}
							</Link>
						) : null}
						{conversation.booking ? (
							<span>Booking: {conversation.booking.name}</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-3">
				{messages.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No messages in this conversation.
					</p>
				) : (
					messages.map((message) => (
						<MessageCard key={message.id} message={message} />
					))
				)}
			</div>

			{isEmail ? (
				<ReplyComposer conversationId={id} messages={messages} />
			) : (
				<p className="text-muted-foreground text-sm">
					Replies are currently supported for email conversations.
				</p>
			)}
		</div>
	);
}

function MessageCard({ message }: { message: Message }) {
	const sender = parseParticipant(message.sender);
	const recipients = parseParticipants(message.recipients);
	const outbound = message.direction === "OUTBOUND";

	return (
		<article
			className={cn(
				"rounded-lg border bg-card p-4",
				outbound && "border-primary/30",
			)}
		>
			<header className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium">
					{sender?.name ?? sender?.email ?? "Unknown sender"}
				</span>
				{sender?.name ? (
					<span className="text-muted-foreground text-xs">{sender.email}</span>
				) : null}
				<Badge variant={outbound ? "secondary" : "outline"}>
					{outbound ? "Sent" : "Received"}
				</Badge>
				<span className="ml-auto text-muted-foreground text-xs">
					<LocalDateTime
						date={message.sentAt}
						options={{
							month: "short",
							day: "numeric",
							hour: "numeric",
							minute: "2-digit",
						}}
					/>
				</span>
			</header>
			{recipients.length > 0 ? (
				<p className="mt-1 truncate text-muted-foreground text-xs">
					To: {recipients.map((entry) => entry.name ?? entry.email).join(", ")}
				</p>
			) : null}
			<p className="mt-3 whitespace-pre-wrap text-sm">
				{message.body ?? message.snippet ?? ""}
			</p>
		</article>
	);
}

export function parseParticipant(
	value: unknown,
): { email: string; name: string | null } | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.email !== "string") return null;
	return {
		email: candidate.email,
		name: typeof candidate.name === "string" ? candidate.name : null,
	};
}

export function parseParticipants(
	value: unknown,
): { email: string; name: string | null }[] {
	if (!Array.isArray(value)) return [];
	return value
		.map(parseParticipant)
		.filter((entry): entry is { email: string; name: string | null } =>
			Boolean(entry),
		);
}
