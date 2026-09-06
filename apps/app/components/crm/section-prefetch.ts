"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { useTRPC } from "@/lib/trpc/client";

export type Section =
	| "/"
	| "/inbox"
	| "/command"
	| "/calendar"
	| "/marketing"
	| "/companies"
	| "/contacts"
	| "/deals"
	| "/settings";

export function usePrefetchSection(): (section: string) => void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		(section: string) => {
			switch (section) {
				case "/":
					void queryClient.prefetchQuery(
						trpc.dashboard.summary.queryOptions({ scope: "me" }),
					);
					return;
				case "/inbox":
					void queryClient.prefetchQuery(
						trpc.businessOs.inbox.queryOptions({ limit: 50 }),
					);
					void queryClient.prefetchQuery(
						trpc.businessOs.overview.queryOptions(),
					);
					return;
				case "/command":
					void queryClient.prefetchQuery(
						trpc.businessOs.overview.queryOptions(),
					);
					void queryClient.prefetchQuery(
						trpc.businessOs.observability.queryOptions(),
					);
					void queryClient.prefetchQuery(
						trpc.businessOs.knowledge.queryOptions(),
					);
					return;
				case "/calendar":
					void queryClient.prefetchQuery(
						trpc.businessOs.calendar.queryOptions({
							view: "week",
							date: new Date().toISOString().slice(0, 10),
							search: "",
						}),
					);
					return;
				case "/marketing":
					void queryClient.prefetchQuery(
						trpc.marketing.overview.queryOptions(),
					);
					return;
				case "/companies":
					void queryClient.prefetchQuery(
						trpc.companies.list.queryOptions(
							companiesSearchParams.defaultInput(),
						),
					);
					return;
				case "/contacts":
					void queryClient.prefetchQuery(
						trpc.contacts.list.queryOptions(
							contactsSearchParams.defaultInput(),
						),
					);
					return;
				case "/deals":
					void queryClient.prefetchQuery(
						trpc.deals.list.queryOptions(dealsSearchParams.defaultInput()),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient],
	);
}
