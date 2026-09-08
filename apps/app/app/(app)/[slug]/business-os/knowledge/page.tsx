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
import { KnowledgeView } from "./knowledge-view";

export const metadata: Metadata = {
	title: "Knowledge",
};

export default function KnowledgePage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Knowledge</PageShellTitle>
					<PageShellDescription>
						Knowledge items and business rules agents use when they work.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<KnowledgeData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function KnowledgeData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.knowledge.queryOptions());

	return (
		<HydrateClient>
			<KnowledgeView />
		</HydrateClient>
	);
}
