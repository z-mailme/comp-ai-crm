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
import { ActivityFeed } from "./activity-feed";

export const metadata: Metadata = {
	title: "Activity",
};

export default function ActivityPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Activity</PageShellTitle>
					<PageShellDescription>
						Every note, call, email, meeting and task across the business unit.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<ActivityData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ActivityData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.businessOs.activityFeed.queryOptions({ limit: 50 }),
	);

	return (
		<HydrateClient>
			<ActivityFeed />
		</HydrateClient>
	);
}
