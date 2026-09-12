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
import { AccountingView } from "../finance/finance-module-view";

export const metadata: Metadata = {
	title: "Accounting",
};

export default async function AccountingPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Accounting</PageShellTitle>
					<PageShellDescription>
						Read the Finance OS ledger and system accounts.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<AccountingView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
