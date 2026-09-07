import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConversationDetail } from "./conversation-detail";

export const metadata: Metadata = {
	title: "Conversation",
};

export default function ConversationPage({
	params,
}: PageProps<"/[slug]/inbox/[id]">) {
	return (
		<PageShell>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<ConversationData params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ConversationData({
	params,
}: Pick<PageProps<"/[slug]/inbox/[id]">, "params">) {
	const [{ id }] = await Promise.all([params, requireSession()]);
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.businessOs.conversation.queryOptions({ id }),
	);

	return (
		<HydrateClient>
			<ConversationDetail id={id} />
		</HydrateClient>
	);
}
