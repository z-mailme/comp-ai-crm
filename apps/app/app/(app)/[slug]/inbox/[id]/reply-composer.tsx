"use client";

import { authClient } from "@crm/auth/client";
import { GMAIL_SEND_SCOPE, SYNC_SCOPES } from "@crm/auth/scopes";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Message = RouterOutputs["businessOs"]["conversation"]["messages"][number];

export function ReplyComposer({
	conversationId,
	messages,
}: {
	conversationId: string;
	messages: Message[];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [replyAll, setReplyAll] = useState(false);
	const [showCcBcc, setShowCcBcc] = useState(false);
	const [cc, setCc] = useState("");
	const [bcc, setBcc] = useState("");
	const [body, setBody] = useState("");
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [scopeRequired, setScopeRequired] = useState(false);
	const [granting, setGranting] = useState(false);

	const send = useMutation(
		trpc.google.sendEmail.mutationOptions({
			onSuccess: async (result) => {
				if (result.status === "sent") {
					toast.success(result.duplicate ? "Already sent." : "Reply sent.");
					setBody("");
					setCc("");
					setBcc("");
					setScopeRequired(false);
					setIdempotencyKey(crypto.randomUUID());
					await cache.conversation(conversationId);
					return;
				}
				if (result.status === "scope-required") {
					setScopeRequired(true);
					return;
				}
				toast.error(result.reason ?? "The reply could not be sent.");
			},
			onError: (error) => {
				toast.error(error.message || "The reply could not be sent.");
			},
		}),
	);

	const recipients = displayRecipients(messages, replyAll);

	function handleSend() {
		if (!body.trim() || send.isPending) return;
		send.mutate({
			mode: "reply",
			conversationId,
			replyAll,
			cc: splitEmails(cc),
			bcc: splitEmails(bcc),
			body: body.trim(),
			idempotencyKey,
		});
	}

	async function handleGrant() {
		setGranting(true);
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES, GMAIL_SEND_SCOPE],
			callbackURL: window.location.href,
			errorCallbackURL: window.location.href,
		});
		if (error) {
			setGranting(false);
			toast.error(error.message);
		}
	}

	if (scopeRequired) {
		return (
			<div className="rounded-lg border bg-card p-4 text-sm">
				<p className="font-medium">Additional Gmail permission required</p>
				<p className="mt-1 text-muted-foreground">
					Sending email needs the Gmail send scope. Your existing Google
					connection and synced mail stay intact — Google will ask you to
					confirm the extra permission.
				</p>
				<div className="mt-3 flex gap-2">
					<Button
						type="button"
						disabled={granting}
						onClick={() => {
							handleGrant().catch(() => setGranting(false));
						}}
					>
						{granting ? "Opening Google…" : "Grant Gmail send permission"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setScopeRequired(false)}
					>
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex overflow-hidden rounded-md border">
					{(["Reply", "Reply all"] as const).map((label) => {
						const active = (label === "Reply all") === replyAll;
						return (
							<button
								key={label}
								type="button"
								onClick={() => setReplyAll(label === "Reply all")}
								className={cn(
									"px-3 py-1.5 text-sm hover:bg-muted",
									active && "bg-muted font-medium",
								)}
								aria-pressed={active}
							>
								{label}
							</button>
						);
					})}
				</div>
				<span className="text-muted-foreground text-xs">
					To: {recipients.length > 0 ? recipients.join(", ") : "the thread"}
				</span>
				<button
					type="button"
					className="ml-auto text-muted-foreground text-xs hover:text-foreground"
					onClick={() => setShowCcBcc((value) => !value)}
				>
					Cc/Bcc
				</button>
			</div>

			{showCcBcc ? (
				<div className="mt-3 grid gap-2 sm:grid-cols-2">
					<Input
						value={cc}
						onChange={(event) => setCc(event.target.value)}
						placeholder="Cc — comma separated"
						name="cc"
					/>
					<Input
						value={bcc}
						onChange={(event) => setBcc(event.target.value)}
						placeholder="Bcc — comma separated"
						name="bcc"
					/>
				</div>
			) : null}

			<Textarea
				value={body}
				onChange={(event) => setBody(event.target.value)}
				placeholder="Write your reply…"
				rows={6}
				className="mt-3"
				name="body"
			/>

			<div className="mt-3 flex items-center gap-2">
				<Button
					type="button"
					disabled={!body.trim() || send.isPending}
					onClick={handleSend}
				>
					{send.isPending ? "Sending…" : "Send"}
				</Button>
				<span className="text-muted-foreground text-xs">
					Sent through your connected Google account.
				</span>
			</div>
		</div>
	);
}

function displayRecipients(messages: Message[], replyAll: boolean): string[] {
	const anchor = messages[messages.length - 1];
	if (!anchor) return [];

	if (anchor.direction === "INBOUND") {
		const sender = anchor.sender;
		const to = sender ? [sender.name ?? sender.email] : [];
		if (!replyAll) return to;
		return [
			...to,
			...anchor.recipients.map((entry) => entry.name ?? entry.email),
		];
	}

	return anchor.recipients.map((entry) => entry.name ?? entry.email);
}

export function splitEmails(value: string): string[] {
	return value
		.split(/[,;]/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}
