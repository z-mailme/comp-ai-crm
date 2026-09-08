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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const POLL_MS = 5_000;

export function BusinessBrain() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const job = useQuery({
		...trpc.brain.job.queryOptions(),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "RUNNING" || status === "PLANNING" ? POLL_MS : false;
		},
	});

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
			</CardContent>
		</Card>
	);
}
