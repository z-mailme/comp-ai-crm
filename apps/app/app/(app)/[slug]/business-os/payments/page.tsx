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
import { PaymentsView } from "../finance/finance-module-view";

export const metadata: Metadata = {
	title: "Payments",
};

export default async function PaymentsPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Payments</PageShellTitle>
					<PageShellDescription>
						Record payments and match them to invoices.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<PaymentsView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
