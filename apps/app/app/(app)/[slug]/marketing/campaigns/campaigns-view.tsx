"use client";

import Add from "@carbon/icons-react/es/Add";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Campaign = RouterOutputs["marketingCampaigns"]["list"]["rows"][number];

const STATUS_FILTERS = [
	"ALL",
	"DRAFT",
	"PLANNED",
	"ACTIVE",
	"PAUSED",
	"COMPLETED",
	"ARCHIVED",
] as const;

const CHANNEL_LABELS = {
	GOOGLE_ADS: "Google Ads",
	META_ADS: "Meta Ads",
	EMAIL: "Email",
	SOCIAL: "Social",
	CONTENT: "Content",
	WEBSITE: "Website",
} satisfies Record<Campaign["channels"][number], string>;

const COLUMNS = [
	{ id: "name", header: "Campaign" },
	{ id: "status", header: "Status", width: "7rem" },
	{ id: "channels", header: "Channels" },
	{ id: "dates", header: "Dates", width: "11rem" },
	{ id: "budget", header: "Budget", align: "right" as const, width: "8rem" },
	{ id: "utm", header: "UTM campaign" },
	{ id: "updated", header: "Updated", width: "7rem" },
];

export function CampaignsView() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
	const [open, setOpen] = useState(false);

	const list = useQuery(
		trpc.marketingCampaigns.list.queryOptions(
			status === "ALL" ? {} : { status },
		),
	);

	const create = useMutation(
		trpc.marketingCampaigns.create.mutationOptions({
			onSuccess: async (campaign) => {
				await queryClient.invalidateQueries();
				setOpen(false);
				toast.success("Campaign created.");
				router.push(workspaceUrl(`/marketing/campaigns/${campaign.id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (list.isPending || !list.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Select
					value={status}
					onValueChange={(value) =>
						setStatus(value as (typeof STATUS_FILTERS)[number])
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_FILTERS.map((entry) => (
							<SelectItem key={entry} value={entry}>
								{entry === "ALL" ? "All statuses" : entry}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<Icon icon={Add} data-icon="inline-start" />
							New campaign
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>New campaign</DialogTitle>
							<DialogDescription>
								Group ads, email, social and content under one plan.
							</DialogDescription>
						</DialogHeader>
						<CreateCampaignForm
							pending={create.isPending}
							onSubmit={(event) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								const name = text(form, "name");
								if (!name) {
									toast.error("Name is required.");
									return;
								}
								create.mutate({
									name,
									objective: text(form, "objective") || null,
									utmCampaign: text(form, "utmCampaign") || null,
									utmSource: text(form, "utmSource") || null,
									utmMedium: text(form, "utmMedium") || null,
								});
							}}
						/>
					</DialogContent>
				</Dialog>
			</div>

			<Card className="min-w-0">
				<CardContent className="p-0">
					{list.data.rows.length === 0 ? (
						<p className="p-6 text-muted-foreground text-sm">
							No campaigns yet. Create one to group your ads, email, social and
							content work.
						</p>
					) : (
						<SimpleTable columns={COLUMNS} surface="page">
							{list.data.rows.map((campaign) => (
								<CampaignRow key={campaign.id} campaign={campaign} />
							))}
						</SimpleTable>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<SimpleTableRow>
			<TableCell>
				<Link
					href={workspaceUrl(`/marketing/campaigns/${campaign.id}`)}
					className="font-medium hover:underline"
				>
					{campaign.name}
				</Link>
				{campaign.objective ? (
					<p className="mt-0.5 truncate text-muted-foreground text-xs">
						{campaign.objective}
					</p>
				) : null}
			</TableCell>
			<TableCell>
				<Badge variant="outline">{campaign.status}</Badge>
			</TableCell>
			<TableCell>
				{campaign.channels.length === 0 ? (
					<EmptyCellValue />
				) : (
					<span className="text-xs">
						{campaign.channels
							.map((channel) => CHANNEL_LABELS[channel])
							.join(", ")}
					</span>
				)}
			</TableCell>
			<TableCell className="text-xs tabular-nums">
				{formatDateRange(campaign.startDate, campaign.endDate)}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{campaign.budget === null ? (
					<EmptyCellValue />
				) : (
					formatMoney(Math.round(campaign.budget * 100), campaign.currency)
				)}
			</TableCell>
			<TableCell className="text-xs">
				{campaign.utmCampaign ?? <EmptyCellValue />}
			</TableCell>
			<TableCell className="text-xs tabular-nums">
				{formatDay(campaign.updatedAt)}
			</TableCell>
		</SimpleTableRow>
	);
}

function CreateCampaignForm({
	pending,
	onSubmit,
}: {
	pending: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<form className="flex flex-col gap-3" onSubmit={onSubmit}>
			<Field name="name" label="Name" required />
			<Field name="objective" label="Objective" placeholder="Bookings" />
			<Field
				name="utmCampaign"
				label="UTM campaign"
				placeholder="spring-sale"
			/>
			<div className="grid grid-cols-2 gap-3">
				<Field name="utmSource" label="UTM source" placeholder="facebook" />
				<Field name="utmMedium" label="UTM medium" placeholder="cpc" />
			</div>
			<DialogFooter>
				<Button type="submit" disabled={pending}>
					<Icon icon={Add} data-icon="inline-start" />
					Create campaign
				</Button>
			</DialogFooter>
		</form>
	);
}

function Field({
	name,
	label,
	placeholder,
	required,
}: {
	name: string;
	label: string;
	placeholder?: string;
	required?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={name}>{label}</Label>
			<Input
				id={name}
				name={name}
				placeholder={placeholder}
				required={required}
			/>
		</div>
	);
}

function text(form: FormData, name: string): string {
	const value = form.get(name);
	if (value === null || value instanceof File) return "";
	return value.trim();
}

function formatDay(value: string): string {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function formatDateRange(
	start: string | null,
	end: string | null,
): React.ReactNode {
	if (!start && !end) return <EmptyCellValue />;
	const from = start ? formatDay(start) : "…";
	const to = end ? formatDay(end) : "…";
	return `${from} – ${to}`;
}
