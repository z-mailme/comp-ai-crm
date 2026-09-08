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
import { UnifiedInbox } from "./unified-inbox";

export default function InboxPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Unified Inbox</PageShellTitle>
					<PageShellDescription>
						Customer conversations across email and future channels.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<InboxSummary />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function InboxSummary() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.businessOs.inbox.queryOptions({ limit: 50 }),
		),
		queryClient.prefetchQuery(trpc.businessOs.overview.queryOptions()),
	]);

	return (
		<HydrateClient>
			<UnifiedInbox />
		</HydrateClient>
	);
}
