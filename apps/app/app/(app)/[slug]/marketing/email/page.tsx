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
import { EmailMarketingWorkspace } from "./email-workspace";

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
						Listmonk campaigns, templates, lists, subscribers and performance.
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

	await Promise.all([
		queryClient.prefetchQuery(trpc.marketing.email.queryOptions()),
		queryClient.prefetchQuery(trpc.marketingEmail.templates.queryOptions()),
	]);

	return (
		<HydrateClient>
			<EmailMarketingWorkspace />
		</HydrateClient>
	);
}
