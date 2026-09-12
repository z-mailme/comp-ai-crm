import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { QuotesView } from "../finance/finance-module-view";

export const metadata: Metadata = {
	title: "Quotes",
};

export default async function QuotesPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Quotes</PageShellTitle>
					<PageShellDescription>
						Create and track customer quotes from Finance OS.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<QuotesView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
