import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ObservabilityView } from "./observability-view";

export const metadata: Metadata = {
	title: "Observability",
};

export default function ObservabilityPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Observability</PageShellTitle>
					<PageShellDescription>
						Event delivery, automation executions and rule status.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<ObservabilityData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ObservabilityData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.observability.queryOptions());

	return (
		<HydrateClient>
			<ObservabilityView />
		</HydrateClient>
	);
}
