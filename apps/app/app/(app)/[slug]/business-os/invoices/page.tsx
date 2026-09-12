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
import { InvoicesView } from "../finance/finance-module-view";

export const metadata: Metadata = {
	title: "Invoices",
};

export default async function InvoicesPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Invoices</PageShellTitle>
					<PageShellDescription>
						Issue invoices and track open balances.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<InvoicesView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
