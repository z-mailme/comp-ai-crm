import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	BUSINESS_OS_NAVIGATION,
	navigationItems,
} from "@/components/business-os-navigation";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";

export const instant = false;

export async function generateMetadata({
	params,
}: CapabilityPageProps): Promise<Metadata> {
	const { module } = await params;
	const item = itemFor(module);

	return {
		title: item?.title ?? "Business OS",
	};
}

export default async function BusinessOsCapabilityPage({
	params,
}: CapabilityPageProps) {
	await requireSession();
	const { slug, module } = await params;
	const item = itemFor(module);

	if (item?.status !== "COMING_SOON") notFound();

	const group = BUSINESS_OS_NAVIGATION.find((candidate) =>
		candidate.items.some((entry) => entry.href === item.href),
	);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{item.title}</PageShellTitle>
					<PageShellDescription>
						Business OS capability planning page.
					</PageShellDescription>
				</PageShellHeading>
				<Badge variant="outline">Coming soon</Badge>
			</PageShellHeader>
			<PageShellContent>
				<Card>
					<CardHeader>
						<CardTitle>
							<div className="flex items-center gap-2">
								{item.title}
								<StatusIndicator size="sm" tone="neutral" label="Not live" />
							</div>
						</CardTitle>
						<CardDescription>
							This area has architecture and navigation. It has no production
							workflow yet.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 text-sm">
						<div className="grid gap-1">
							<span className="font-medium">Group</span>
							<span className="text-muted-foreground">
								{group?.title ?? "Business OS"}
							</span>
						</div>
						<div className="grid gap-1">
							<span className="font-medium">Current status</span>
							<span className="text-muted-foreground">
								No records, totals, or charts appear here until the module has a
								real backend workflow.
							</span>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button asChild variant="outline" size="sm">
								<Link href={`/${slug}`}>Overview</Link>
							</Button>
							<Button asChild variant="ghost" size="sm">
								<Link href={`/${slug}/settings/connections`}>Connections</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</PageShellContent>
		</PageShell>
	);
}

type CapabilityPageProps = {
	params: Promise<{ slug: string; module: string }>;
};

function itemFor(module: string) {
	return navigationItems().find(
		(item) => item.href === `/business-os/${module}`,
	);
}
