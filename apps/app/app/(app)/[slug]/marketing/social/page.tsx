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
import { SocialView } from "./social-view";

export const metadata: Metadata = {
	title: "Social Media",
};

export default function MarketingSocialPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Social Media</PageShellTitle>
					<PageShellDescription>
						Accounts, calendar and publishing — approval required before
						anything goes out.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<SocialData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function SocialData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	const now = new Date();
	const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const to = new Date(now.getFullYear(), now.getMonth() + 2, 0);

	await Promise.all([
		queryClient.prefetchQuery(trpc.marketingSocial.accounts.queryOptions({})),
		queryClient.prefetchQuery(trpc.marketingSocial.posts.queryOptions({})),
		queryClient.prefetchQuery(
			trpc.marketingSocial.calendar.queryOptions({
				from: from.toISOString(),
				to: to.toISOString(),
			}),
		),
		queryClient.prefetchQuery(trpc.marketingSocial.inbox.queryOptions({})),
	]);

	return (
		<HydrateClient>
			<SocialView />
		</HydrateClient>
	);
}
