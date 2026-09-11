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
import { CampaignDetail } from "./campaign-detail";

export const metadata: Metadata = {
	title: "Campaign",
};

export default async function MarketingCampaignDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Campaign</PageShellTitle>
					<PageShellDescription>
						Plan, attribution and performance for one campaign.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<CampaignData id={id} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function CampaignData({ id }: { id: string }) {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingCampaigns.detail.queryOptions({ id }),
	);

	return (
		<HydrateClient>
			<CampaignDetail id={id} />
		</HydrateClient>
	);
}
