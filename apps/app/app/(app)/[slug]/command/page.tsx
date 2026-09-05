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
import { CommandCentre } from "./command-centre";

export default function CommandPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Command Centre</PageShellTitle>
					<PageShellDescription>
						Agent work, approvals, events, rules and safety controls.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<CommandSummary />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function CommandSummary() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await Promise.all([
		queryClient.prefetchQuery(trpc.businessOs.overview.queryOptions()),
		queryClient.prefetchQuery(trpc.businessOs.observability.queryOptions()),
		queryClient.prefetchQuery(trpc.businessOs.knowledge.queryOptions()),
	]);

	return (
		<HydrateClient>
			<CommandCentre />
		</HydrateClient>
	);
}
