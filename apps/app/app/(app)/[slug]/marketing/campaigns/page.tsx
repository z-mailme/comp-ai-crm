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
import { CampaignsView } from "./campaigns-view";

export const metadata: Metadata = {
	title: "Marketing Campaigns",
};

export default function MarketingCampaignsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Campaigns</PageShellTitle>
					<PageShellDescription>
						Cross-channel marketing campaigns tied to leads, bookings and
						revenue.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<CampaignsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function CampaignsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingCampaigns.list.queryOptions({}),
	);

	return (
		<HydrateClient>
			<CampaignsView />
		</HydrateClient>
	);
}
