import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DailyBrief } from "./daily-brief";
import {
	OverviewGreeting,
	OverviewGreetingFallback,
} from "./overview-greeting";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";
import { OverviewDashboard } from "./overview-widgets/overview-dashboard";

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<Suspense fallback={<OverviewGreetingFallback />}>
						<OverviewGreeting />
					</Suspense>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={<OverviewScopeToggleFallback />}>
						<OverviewScopeToggle />
					</Suspense>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Summary searchParams={searchParams} />
				</Suspense>
				<Suspense fallback={null}>
					<BriefSection />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function BriefSection() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await Promise.all([
		queryClient.prefetchQuery(trpc.businessOs.briefDaily.queryOptions()),
		queryClient.prefetchQuery(trpc.businessOs.briefExceptions.queryOptions()),
	]);

	return (
		<HydrateClient>
			<DailyBrief />
		</HydrateClient>
	);
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	const queryClient = getServerQueryClient();
	const serverTrpc = getServerTrpc();
	await Promise.all([
		queryClient.prefetchQuery(
			serverTrpc.dashboard.summary.queryOptions({ scope }),
		),
		queryClient.prefetchQuery(serverTrpc.dashboard.layout.queryOptions()),
	]);

	return (
		<HydrateClient>
			<OverviewDashboard />
		</HydrateClient>
	);
}
