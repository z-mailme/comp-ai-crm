"use client";

import { authClient } from "@crm/auth/client";
import { GMAIL_SEND_SCOPE, SYNC_SCOPES } from "@crm/auth/scopes";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { splitEmails } from "./[id]/reply-composer";

export function ComposeEmail() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);
	const [to, setTo] = useState("");
	const [cc, setCc] = useState("");
	const [bcc, setBcc] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [scopeRequired, setScopeRequired] = useState(false);

	const send = useMutation(
		trpc.google.sendEmail.mutationOptions({
			onSuccess: async (result) => {
				if (result.status === "sent") {
					toast.success(result.duplicate ? "Already sent." : "Email sent.");
					setOpen(false);
					setTo("");
					setCc("");
					setBcc("");
					setSubject("");
					setBody("");
					setScopeRequired(false);
					setIdempotencyKey(crypto.randomUUID());
					await cache.conversation();
					return;
				}
				if (result.status === "scope-required") {
					setScopeRequired(true);
					return;
				}
				toast.error(result.reason ?? "The email could not be sent.");
			},
			onError: (error) => {
				toast.error(error.message || "The email could not be sent.");
			},
		}),
	);

	function handleSend() {
		const recipients = splitEmails(to);
		if (recipients.length === 0 || !subject.trim() || !body.trim()) return;
		if (send.isPending) return;
		send.mutate({
			mode: "compose",
			to: recipients,
			cc: splitEmails(cc),
			bcc: splitEmails(bcc),
			subject: subject.trim(),
			body: body.trim(),
			idempotencyKey,
		});
	}

	async function handleGrant() {
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES, GMAIL_SEND_SCOPE],
			callbackURL: window.location.href,
			errorCallbackURL: window.location.href,
		});
		if (error) toast.error(error.message);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>Compose</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>New email</DialogTitle>
					<DialogDescription>
						Sent through your connected Google account.
					</DialogDescription>
				</DialogHeader>
				{scopeRequired ? (
					<div className="grid gap-3 text-sm">
						<p className="text-muted-foreground">
							Sending email needs the Gmail send scope. Your existing Google
							connection stays intact — Google will ask you to confirm the extra
							permission.
						</p>
						<Button
							type="button"
							onClick={() => {
								handleGrant().catch(() =>
									toast.error("Could not reach Google."),
								);
							}}
						>
							Grant Gmail send permission
						</Button>
					</div>
				) : (
					<div className="grid gap-2">
						<Input
							value={to}
							onChange={(event) => setTo(event.target.value)}
							placeholder="To — comma separated"
							name="to"
						/>
						<div className="grid gap-2 sm:grid-cols-2">
							<Input
								value={cc}
								onChange={(event) => setCc(event.target.value)}
								placeholder="Cc"
								name="cc"
							/>
							<Input
								value={bcc}
								onChange={(event) => setBcc(event.target.value)}
								placeholder="Bcc"
								name="bcc"
							/>
						</div>
						<Input
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
							placeholder="Subject"
							name="subject"
						/>
						<Textarea
							value={body}
							onChange={(event) => setBody(event.target.value)}
							placeholder="Write your email…"
							rows={8}
							name="body"
						/>
						<div className="flex justify-end">
							<Button
								type="button"
								disabled={
									!to.trim() ||
									!subject.trim() ||
									!body.trim() ||
									send.isPending
								}
								onClick={handleSend}
							>
								{send.isPending ? "Sending…" : "Send"}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
