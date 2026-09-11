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
import { AudiencesView } from "./audiences-view";

export const metadata: Metadata = {
	title: "Marketing Audiences",
};

export default function MarketingAudiencesPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Audiences</PageShellTitle>
					<PageShellDescription>
						CRM-based audiences with explicit consent, live counts and Listmonk
						export.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<AudiencesData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function AudiencesData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingAudiences.list.queryOptions({}),
	);

	return (
		<HydrateClient>
			<AudiencesView />
		</HydrateClient>
	);
}
