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
import { AnalyticsView } from "./analytics-view";

export const metadata: Metadata = {
	title: "Business Analytics",
};

export default function BusinessAnalyticsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Business Analytics</PageShellTitle>
					<PageShellDescription>
						Pipeline value, outcomes and activity for the active business unit.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<AnalyticsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function AnalyticsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.analytics.queryOptions());
	await queryClient.prefetchQuery(
		trpc.googleAnalytics.report.queryOptions({ days: 28 }),
	);

	return (
		<HydrateClient>
			<AnalyticsView />
		</HydrateClient>
	);
}
