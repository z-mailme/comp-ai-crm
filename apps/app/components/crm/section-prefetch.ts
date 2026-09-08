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
	| "/settings"
	| "/business-os/activity"
	| "/business-os/bookings"
	| "/business-os/analytics"
	| "/business-os/reports"
	| "/business-os/finance"
	| "/business-os/knowledge"
	| "/business-os/observability"
	| "/business-os/operations";

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
				case "/business-os/activity":
					void queryClient.prefetchQuery(
						trpc.businessOs.activityFeed.queryOptions({ limit: 50 }),
					);
					return;
				case "/business-os/bookings":
					void queryClient.prefetchQuery(
						trpc.businessOs.bookings.queryOptions({
							when: "upcoming",
							search: "",
							limit: 50,
						}),
					);
					return;
				case "/business-os/analytics":
				case "/business-os/reports":
					void queryClient.prefetchQuery(
						trpc.businessOs.analytics.queryOptions(),
					);
					return;
				case "/business-os/finance":
					void queryClient.prefetchQuery(
						trpc.businessOs.finance.queryOptions(),
					);
					return;
				case "/business-os/knowledge":
					void queryClient.prefetchQuery(
						trpc.businessOs.knowledge.queryOptions(),
					);
					return;
				case "/business-os/observability":
					void queryClient.prefetchQuery(
						trpc.businessOs.observability.queryOptions(),
					);
					return;
				case "/business-os/operations":
					void queryClient.prefetchQuery(
						trpc.businessOs.overview.queryOptions(),
					);
					void queryClient.prefetchQuery(
						trpc.businessOs.calendar.queryOptions({}),
					);
					void queryClient.prefetchQuery(
						trpc.activities.myTasks.queryOptions({ window: "all", limit: 25 }),
					);
					void queryClient.prefetchQuery(
						trpc.businessOs.bookings.queryOptions({
							when: "upcoming",
							search: "",
							limit: 10,
						}),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient],
	);
}
