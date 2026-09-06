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
import { EmailMarketingWorkspace } from "../marketing-workspaces";

export const metadata: Metadata = {
	title: "Email Marketing",
};

export default function EmailMarketingPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Email Marketing</PageShellTitle>
					<PageShellDescription>
						Listmonk campaigns, lists, templates, and test sends.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<EmailMarketingData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function EmailMarketingData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketing.email.queryOptions());

	return (
		<HydrateClient>
			<EmailMarketingWorkspace />
		</HydrateClient>
	);
}
