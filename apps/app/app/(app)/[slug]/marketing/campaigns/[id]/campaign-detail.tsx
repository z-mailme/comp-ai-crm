"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { Textarea } from "@crm/ui/components/textarea";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const STATUSES = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED"] as const;

export function CampaignDetail({ id }: { id: string }) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const router = useRouter();
	const queryClient = useQueryClient();

	const detail = useQuery(trpc.marketingCampaigns.detail.queryOptions({ id }));

	const update = useMutation(
		trpc.marketingCampaigns.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Campaign saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.marketingCampaigns.archive.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Campaign archived.");
				router.push(workspaceUrl("/marketing/campaigns"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const data = detail.data;
	if (detail.isPending || !data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const { campaign, performance } = data;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="font-semibold text-lg">{campaign.name}</h2>
				<Badge variant="outline">{campaign.status}</Badge>
			</div>

			<StatGroup>
				<StatCard
					label="Leads"
					value={performance.leads}
					description={`${performance.firstTouchLeads} first touch · ${performance.lastTouchLeads} latest touch`}
				/>
				<StatCard
					label="Bookings"
					value={performance.bookings}
					description="Bookings on attributed deals"
				/>
				<StatCard
					label="Expected revenue"
					value={
						performance.expectedRevenueCents === null
							? "—"
							: formatMoney(
									performance.expectedRevenueCents,
									performance.currency,
								)
					}
					description="Open and won attributed deals"
				/>
				<StatCard
					label="Closed revenue"
					value={
						performance.closedRevenueCents === null
							? "—"
							: formatMoney(
									performance.closedRevenueCents,
									performance.currency,
								)
					}
					description={
						performance.unconvertedDeals > 0
							? `${performance.unconvertedDeals} deals not converted to ${performance.currency}`
							: "Closed-won attributed deals"
					}
				/>
			</StatGroup>

			{!performance.measured ? (
				<p className="rounded-md border p-3 text-muted-foreground text-sm">
					This campaign has no UTM campaign key, so leads, bookings and revenue
					cannot be attributed to it yet. Add the UTM key below and use it in
					your links.
				</p>
			) : null}

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Plan</CardTitle>
						<CardDescription>
							Objective, budget, dates and targeting.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<CampaignForm
							key={campaign.updatedAt}
							pending={update.isPending}
							defaults={campaign}
							onSubmit={(event) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								update.mutate({
									id: campaign.id,
									name: text(form, "name") || undefined,
									objective: text(form, "objective") || null,
									targetAudience: text(form, "targetAudience") || null,
									budget: numberOrNull(text(form, "budget")),
									notes: text(form, "notes") || null,
									utmSource: text(form, "utmSource") || null,
									utmMedium: text(form, "utmMedium") || null,
									utmCampaign: text(form, "utmCampaign") || null,
									utmContent: text(form, "utmContent") || null,
									utmTerm: text(form, "utmTerm") || null,
								});
							}}
						/>
					</CardContent>
				</Card>

				<div className="flex min-w-0 flex-col gap-6">
					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Status</CardTitle>
							<CardDescription>
								Move the campaign through its lifecycle.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<Select
								value={campaign.status}
								onValueChange={(value) =>
									update.mutate({
										id: campaign.id,
										status: value as (typeof STATUSES)[number],
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUSES.map((status) => (
										<SelectItem key={status} value={status}>
											{status}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								disabled={archive.isPending}
								onClick={() => archive.mutate({ id: campaign.id })}
							>
								Archive campaign
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function CampaignForm({
	pending,
	defaults,
	onSubmit,
}: {
	pending: boolean;
	defaults: {
		name: string;
		objective: string | null;
		targetAudience: string | null;
		budget: number | null;
		notes: string | null;
		utmSource: string | null;
		utmMedium: string | null;
		utmCampaign: string | null;
		utmContent: string | null;
		utmTerm: string | null;
	};
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<form className="flex flex-col gap-4" onSubmit={onSubmit}>
			<div className="grid gap-4 md:grid-cols-2">
				<Field name="name" label="Name" defaultValue={defaults.name} />
				<Field
					name="objective"
					label="Objective"
					defaultValue={defaults.objective ?? ""}
				/>
				<Field
					name="targetAudience"
					label="Target audience"
					defaultValue={defaults.targetAudience ?? ""}
				/>
				<Field
					name="budget"
					label="Budget"
					type="number"
					defaultValue={defaults.budget === null ? "" : String(defaults.budget)}
				/>
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				<Field
					name="utmSource"
					label="UTM source"
					defaultValue={defaults.utmSource ?? ""}
				/>
				<Field
					name="utmMedium"
					label="UTM medium"
					defaultValue={defaults.utmMedium ?? ""}
				/>
				<Field
					name="utmCampaign"
					label="UTM campaign"
					defaultValue={defaults.utmCampaign ?? ""}
				/>
				<Field
					name="utmContent"
					label="UTM content"
					defaultValue={defaults.utmContent ?? ""}
				/>
				<Field
					name="utmTerm"
					label="UTM term"
					defaultValue={defaults.utmTerm ?? ""}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="notes">Notes</Label>
				<Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} />
			</div>
			<div>
				<Button type="submit" disabled={pending}>
					Save changes
				</Button>
			</div>
		</form>
	);
}

function Field({
	name,
	label,
	type = "text",
	defaultValue,
}: {
	name: string;
	label: string;
	type?: string;
	defaultValue?: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={name}>{label}</Label>
			<Input id={name} name={name} type={type} defaultValue={defaultValue} />
		</div>
	);
}

function text(form: FormData, name: string): string {
	const value = form.get(name);
	if (value === null || value instanceof File) return "";
	return value.trim();
}

function numberOrNull(value: string): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}
