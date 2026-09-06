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
import { MarketingOverview } from "./marketing-workspaces";

export const metadata: Metadata = {
	title: "Marketing",
};

export default function MarketingPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Marketing</PageShellTitle>
					<PageShellDescription>
						Email and paid media workspaces connected to CRM context.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<MarketingData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function MarketingData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketing.overview.queryOptions());

	return (
		<HydrateClient>
			<MarketingOverview />
		</HydrateClient>
	);
}
