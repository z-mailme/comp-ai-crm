"use client";

import { Badge } from "@crm/ui/components/badge";
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
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

export function AiProviders() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const providers = useQuery(trpc.settings.providers.queryOptions());

	const test = useMutation(
		trpc.settings.testProvider.mutationOptions({
			onSuccess: async (_result, input) => {
				toast.success(
					`Connection test queued. It runs in the agent and reports back here.`,
				);
				await queryClient.invalidateQueries({
					queryKey: trpc.settings.providers.queryKey(),
				});
				setTimeout(() => {
					void queryClient.invalidateQueries({
						queryKey: trpc.settings.providers.queryKey(),
					});
				}, 4_000);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = providers.data ?? [];
	if (rows.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Model providers</CardTitle>
				<CardDescription>
					Direct provider connections. A configured provider offers its models
					in the research agent picker, called directly instead of through the
					AI Gateway.
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				{rows.map((provider) => (
					<div key={provider.id} className="flex items-center gap-3 text-sm">
						<StatusIndicator
							tone={provider.configured ? "success" : "neutral"}
							label={provider.configured ? "Configured" : "Not configured"}
						/>
						<span className="font-medium">{provider.label}</span>
						<span className="text-muted-foreground text-xs">
							{provider.models.map((model) => model.label).join(", ")}
						</span>
						<span className="ml-auto flex items-center gap-2">
							{provider.lastTest ? (
								<span className="text-muted-foreground text-xs">
									{provider.lastTest.pending
										? "Testing…"
										: (provider.lastTest.outcome ?? "")}
									{provider.lastTest.finishedAt ? (
										<>
											{" "}
											·{" "}
											<LocalRelativeTime date={provider.lastTest.finishedAt} />
										</>
									) : null}
								</span>
							) : null}
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={test.isPending}
								onClick={() =>
									test.mutate({
										provider: provider.id as "deepseek" | "moonshot",
									})
								}
							>
								Test connection
							</Button>
						</span>
					</div>
				))}

				<p className="text-muted-foreground text-xs">
					Keys are read from the environment by the agent only. Set{" "}
					<Badge variant="outline">DEEPSEEK_API_KEY</Badge> or{" "}
					<Badge variant="outline">MOONSHOT_API_KEY</Badge> and restart the
					agent to configure a provider. Keys are never shown here.
				</p>
			</CardContent>
		</Card>
	);
}
