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
import { ContentDetail } from "./content-detail";

export const metadata: Metadata = {
	title: "Content",
};

export default function MarketingContentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Content</PageShellTitle>
					<PageShellDescription>
						Edit, review and schedule this content. Publishing always requires
						approval.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<DetailData params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function DetailData({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingContent.detail.queryOptions({ id }),
	);

	return (
		<HydrateClient>
			<ContentDetail id={id} />
		</HydrateClient>
	);
}
