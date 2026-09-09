"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import { StatCard } from "@crm/ui/components/stat-card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function DailyBrief() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();

	const brief = useQuery(trpc.businessOs.briefDaily.queryOptions());
	const exceptions = useQuery(trpc.businessOs.briefExceptions.queryOptions());

	if (!brief.data) return null;

	const data = brief.data;
	const rows = exceptions.data?.exceptions ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Today</CardTitle>
				<CardDescription>
					What needs attention, from the events and messages already synced.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<StatGroup>
					<StatCard label="Events today" value={data.eventsToday} />
					<StatCard label="New enquiries" value={data.newEnquiries} />
					<StatCard label="Quotes to follow up" value={data.quotesToFollowUp} />
					<StatCard
						label="Deposits outstanding"
						value={data.depositsOutstanding}
					/>
					<StatCard label="POPs received" value={data.popReceived} />
					<StatCard
						label="Bookings missing details"
						value={data.bookingsMissingDetails}
					/>
				</StatGroup>

				{rows.length > 0 ? (
					<ul className="flex flex-col gap-1">
						{rows.slice(0, 8).map((exception) => (
							<li
								key={exception.id}
								className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
							>
								<StatusIndicator
									tone={
										exception.severity === "URGENT"
											? "error"
											: exception.severity === "ATTENTION"
												? "warning"
												: "neutral"
									}
									label={exception.severity}
								/>
								<span className="min-w-0 flex-1 truncate">
									{exception.title}
								</span>
								{exception.suggestedAction ? (
									<Link
										href={
											exception.conversationId
												? workspaceUrl(`/inbox/${exception.conversationId}`)
												: exception.dealId
													? workspaceUrl(`/deals/${exception.dealId}`)
													: workspaceUrl("/")
										}
										className="shrink-0 text-muted-foreground text-xs hover:text-foreground"
									>
										{exception.suggestedAction}
									</Link>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">
						Nothing needs attention right now.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
