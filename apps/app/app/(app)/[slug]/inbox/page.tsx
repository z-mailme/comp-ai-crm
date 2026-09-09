import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { MailboxWorkspace } from "./mailbox-workspace";

export default function InboxPage() {
	return (
		<PageShell contained className="gap-4">
			<PageShellContent className="flex min-h-0 flex-1 flex-col">
				<Suspense fallback={<PageShellLoading />}>
					<InboxData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function InboxData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.google.gmailLabels.queryOptions());

	return (
		<HydrateClient>
			<MailboxWorkspace />
		</HydrateClient>
	);
}
