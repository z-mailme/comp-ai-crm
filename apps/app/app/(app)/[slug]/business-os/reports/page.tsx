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
import { ReportsView } from "./reports-view";

export const metadata: Metadata = {
	title: "Reports",
};

export default function ReportsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Reports</PageShellTitle>
					<PageShellDescription>
						Pipeline, outcome and activity reports as exact tables.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<ReportsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ReportsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.analytics.queryOptions());

	return (
		<HydrateClient>
			<ReportsView />
		</HydrateClient>
	);
}
