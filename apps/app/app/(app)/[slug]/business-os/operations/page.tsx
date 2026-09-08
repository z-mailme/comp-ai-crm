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
import { OperationsView } from "./operations-view";

export const metadata: Metadata = {
	title: "Operations",
};

export default function OperationsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Operations</PageShellTitle>
					<PageShellDescription>
						Today's work: tasks, meetings and upcoming bookings in one view.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<OperationsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function OperationsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await Promise.all([
		queryClient.prefetchQuery(trpc.businessOs.overview.queryOptions()),
		queryClient.prefetchQuery(trpc.businessOs.calendar.queryOptions({})),
		queryClient.prefetchQuery(
			trpc.activities.myTasks.queryOptions({ window: "all", limit: 25 }),
		),
		queryClient.prefetchQuery(
			trpc.businessOs.bookings.queryOptions({
				when: "upcoming",
				search: "",
				limit: 10,
			}),
		),
	]);

	return (
		<HydrateClient>
			<OperationsView />
		</HydrateClient>
	);
}
