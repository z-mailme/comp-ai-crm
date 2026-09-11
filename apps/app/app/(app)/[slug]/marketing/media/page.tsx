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
import { MediaView } from "./media-view";

export const metadata: Metadata = {
	title: "Media Library",
};

export default function MarketingMediaPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Media Library</PageShellTitle>
					<PageShellDescription>
						Approved images and videos for campaigns, posts and ads.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<MediaData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function MediaData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketingMedia.list.queryOptions({}));

	return (
		<HydrateClient>
			<MediaView />
		</HydrateClient>
	);
}
