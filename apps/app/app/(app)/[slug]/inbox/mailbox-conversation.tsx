"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import { Avatar, AvatarFallback } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

export function MailboxConversation({
	threadId,
	onBack,
}: {
	threadId: string;
	onBack?: () => void;
}) {
	const trpc = useTRPC();
	const threadQuery = useQuery(trpc.google.thread.queryOptions({ threadId }));

	if (threadQuery.isPending) {
		return (
			<div className="flex flex-1 items-center justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const thread = threadQuery.data;
	if (!thread) {
		return (
			<div className="flex flex-1 items-center justify-center px-6 py-12">
				<p className="text-muted-foreground text-sm">
					This conversation is not available.
				</p>
			</div>
		);
	}

	return (
		<section
			aria-label="Conversation"
			className="flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<header className="flex items-center gap-2 border-b px-3 py-2">
				{onBack ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onBack}
						aria-label="Back to list"
					>
						<Icon icon={ArrowLeft} size={16} />
					</Button>
				) : null}
				<h2 className="min-w-0 flex-1 truncate font-medium text-sm">
					{thread.subject ?? "(no subject)"}
				</h2>
				<span className="shrink-0 text-muted-foreground text-xs">
					{thread.messageCount}{" "}
					{thread.messageCount === 1 ? "message" : "messages"}
				</span>
			</header>

			<ol className="min-h-0 flex-1 overflow-y-auto">
				{thread.messages.map((message, index) => (
					<li
						key={message.id}
						className={cn(
							"flex gap-3 border-b px-3 py-3",
							index === thread.messages.length - 1 && "border-b-0",
						)}
					>
						<Avatar className="size-8 shrink-0">
							<AvatarFallback>
								{initials(message.fromName ?? message.fromEmail)}
							</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex items-baseline gap-2">
								<span className="min-w-0 truncate font-medium text-sm">
									{message.fromName ?? message.fromEmail}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
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
							</div>
							{message.body ? (
								<p className="max-w-prose whitespace-pre-wrap break-words text-sm">
									{message.body}
								</p>
							) : (
								<p className="text-muted-foreground text-sm">
									{message.snippet ?? ""}
								</p>
							)}
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

function initials(value: string): string {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0]?.[0] ?? "";
	const second = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
	return `${first}${second}`.toUpperCase();
}
