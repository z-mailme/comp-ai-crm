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
import { ContentView } from "./content-view";

export const metadata: Metadata = {
	title: "Marketing Content",
};

export default function MarketingContentPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Content</PageShellTitle>
					<PageShellDescription>
						Draft, review and schedule posts, emails and campaign copy.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<ContentData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ContentData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketingContent.list.queryOptions({}));

	return (
		<HydrateClient>
			<ContentView />
		</HydrateClient>
	);
}
