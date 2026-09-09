"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const POLL_MS = 5_000;

export function BusinessBrain() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const cache = useCrmCache();
	const autoAckId = useId();

	const job = useQuery({
		...trpc.brain.job.queryOptions(),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "RUNNING" || status === "PLANNING" ? POLL_MS : false;
		},
	});

	const autoAck = useQuery(trpc.settings.popAutoAcknowledge.queryOptions());

	const setAutoAck = useMutation(
		trpc.settings.setPopAutoAcknowledge.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success("POP acknowledgement setting saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	async function refresh() {
		await queryClient.invalidateQueries({
			queryKey: trpc.brain.job.queryKey(),
		});
	}

	const start = useMutation(
		trpc.brain.start.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const pause = useMutation(
		trpc.brain.pause.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const resume = useMutation(
		trpc.brain.resume.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	const data = job.data;
	const active = data?.status === "RUNNING" || data?.status === "PLANNING";
	const pending = start.isPending || pause.isPending || resume.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Business Brain</CardTitle>
				<CardDescription>
					Learns durable business knowledge from your synced mailbox: pricing,
					policies, processes and communication style, with provenance.
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				{data ? (
					<div className="flex flex-col gap-1 text-sm">
						<div className="flex items-center gap-2">
							<StatusIndicator
								tone={
									data.status === "COMPLETED"
										? "success"
										: data.status === "FAILED"
											? "error"
											: active
												? "info"
												: "neutral"
								}
								label={data.status}
							/>
							<span>
								{data.processedThreads} of {data.totalThreads} threads
							</span>
						</div>
						<p className="text-muted-foreground">
							{data.knowledgeWritten} facts learned · {data.conflictsFound}{" "}
							conflicts · {data.tokensInput + data.tokensOutput} tokens
							{data.modelUsed ? ` · ${data.modelUsed}` : ""}
						</p>
						{data.lastError ? (
							<p className="text-destructive text-xs">{data.lastError}</p>
						) : null}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						No analysis has run yet. Start one when your mailbox is synced — it
						reads only the local mirror, never Gmail directly.
					</p>
				)}

				<div className="flex gap-2">
					{!active && data?.status !== "PAUSED" ? (
						<Button
							type="button"
							disabled={pending}
							onClick={() => start.mutate()}
						>
							Analyse Gmail
						</Button>
					) : null}
					{active ? (
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={() => pause.mutate()}
						>
							Pause
						</Button>
					) : null}
					{data?.status === "PAUSED" ? (
						<Button
							type="button"
							disabled={pending}
							onClick={() => resume.mutate()}
						>
							Resume
						</Button>
					) : null}
				</div>

				<p className="text-muted-foreground text-xs">
					The analysis runs in batches in the agent. Pause any time; resume
					continues from the checkpoint. It never sends email and never changes
					a confirmed rule.
				</p>

				{autoAck.data ? (
					<div className="flex items-start justify-between gap-4 rounded-md border p-3">
						<div className="flex flex-col gap-1">
							<label htmlFor={autoAckId} className="font-medium text-sm">
								Acknowledge proofs of payment automatically
							</label>
							<p className="text-muted-foreground text-xs">
								{autoAck.data.killSwitch
									? "The AI automation kill switch is on, so nothing sends even with this enabled."
									: "Sends the approved thank-you reply only when the POP is strong, the sender is known, and no dispute is detected. Payment is never marked confirmed."}
							</p>
						</div>
						<Switch
							id={autoAckId}
							checked={autoAck.data.enabled}
							disabled={setAutoAck.isPending}
							onCheckedChange={(checked) =>
								setAutoAck.mutate({ enabled: checked })
							}
						/>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
