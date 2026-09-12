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
import { ExpensesView } from "../finance/finance-module-view";

export const metadata: Metadata = {
	title: "Expenses",
};

export default async function ExpensesPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Expenses</PageShellTitle>
					<PageShellDescription>
						Review operator labour and manual expenses.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<ExpensesView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
