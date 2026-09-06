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
import { loadCalendarSearchParams } from "./calendar-search-params";
import { CalendarWorkspace } from "./calendar-workspace";

export const metadata: Metadata = {
	title: "Calendar",
};

export default function CalendarPage({
	searchParams,
}: PageProps<"/[slug]/calendar">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Calendar</PageShellTitle>
					<PageShellDescription>
						Google Calendar meetings linked to CRM context.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<CalendarData searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function CalendarData({
	searchParams,
}: Pick<PageProps<"/[slug]/calendar">, "searchParams">) {
	const [, input] = await Promise.all([
		requireSession(),
		loadCalendarSearchParams(searchParams),
	]);
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.businessOs.calendar.queryOptions(input));

	return (
		<HydrateClient>
			<CalendarWorkspace />
		</HydrateClient>
	);
}
