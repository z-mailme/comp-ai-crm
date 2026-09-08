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
import { BookingsBoard } from "./bookings-board";

export const metadata: Metadata = {
	title: "Bookings",
};

export default function BookingsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Bookings</PageShellTitle>
					<PageShellDescription>
						Event bookings attached to deals, upcoming and past.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<BookingsData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function BookingsData() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.businessOs.bookings.queryOptions({
			when: "upcoming",
			search: "",
			limit: 50,
		}),
	);

	return (
		<HydrateClient>
			<BookingsBoard />
		</HydrateClient>
	);
}
