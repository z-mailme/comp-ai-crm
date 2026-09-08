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
import { FinanceView } from "./finance-view";

export const metadata: Metadata = {
	title: "Finance",
};

export default function FinancePage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Finance</PageShellTitle>
					<PageShellDescription>
						Pipeline value and deal outcomes in the reporting currency.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<FinanceData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function FinanceData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.finance.queryOptions());

	return (
		<HydrateClient>
			<FinanceView />
		</HydrateClient>
	);
}
