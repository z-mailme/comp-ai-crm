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
import { AdsMarketingWorkspace } from "../../marketing-workspaces";

export const metadata: Metadata = {
	title: "Meta Ads",
};

export default function MetaAdsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Meta Ads</PageShellTitle>
					<PageShellDescription>
						Campaign performance read from the Meta Marketing API.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<MetaAdsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function MetaAdsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketing.metaAds.queryOptions());

	return (
		<HydrateClient>
			<AdsMarketingWorkspace provider="META_ADS" />
		</HydrateClient>
	);
}
