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
	title: "Google Ads",
};

export default function GoogleAdsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Google Ads</PageShellTitle>
					<PageShellDescription>
						Campaign performance read from the Google Ads API.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<GoogleAdsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function GoogleAdsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketing.googleAds.queryOptions());

	return (
		<HydrateClient>
			<AdsMarketingWorkspace provider="GOOGLE_ADS" />
		</HydrateClient>
	);
}
