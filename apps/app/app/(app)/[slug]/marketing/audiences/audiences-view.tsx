"use client";

import Add from "@carbon/icons-react/es/Add";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { StatGroup } from "@crm/ui/components/dashboard";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc/types";
import { formatNumber } from "../marketing-workspaces";

type AudienceList = RouterOutputs["marketingAudiences"]["list"];
type Audience = AudienceList["audiences"][number];
type Rules = RouterInputs["marketingAudiences"]["create"]["rules"];

const RECORD_SOURCES = ["MANUAL", "IMPORT", "EMAIL", "CALENDAR", "TRACKING"];
const DEAL_STAGES = [
	"DEMO_BOOKED",
	"QUALIFIED_TO_BUY",
	"UNQUALIFIED_TO_BUY",
	"DECISION_MAKER_BOUGHT_IN",
	"CONTRACT_SENT",
	"CLOSED_WON",
	"CLOSED_LOST",
];
const BOOKING_STATUSES = [
	"PROVISIONAL",
	"HELD",
	"CONFIRMED",
	"COMPLETED",
	"CANCELLED",
];
const RESOURCE_TYPES = ["PHOTO_BOOTH_360", "OPERATOR"];

export function AudiencesView() {
	const trpc = useTRPC();
	const query = useQuery(trpc.marketingAudiences.list.queryOptions({}));
	const [editingId, setEditingId] = useState<string | null>(null);

	if (query.isPending || !query.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const data = query.data;
	const editing = data.audiences.find((row) => row.id === editingId) ?? null;

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Marketing allowed"
					value={data.consent.allowed}
					description="Contacts with explicit consent"
				/>
				<StatCard
					label="No consent"
					value={data.consent.blocked}
					description="Never receive marketing"
				/>
				<StatCard
					label="Unsubscribed"
					value={data.consent.unsubscribed}
					description="Never re-subscribed silently"
				/>
				<StatCard
					label="Contacts"
					value={data.consent.total}
					description="Active CRM contacts"
				/>
			</StatGroup>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Audiences</CardTitle>
						<CardDescription>
							Counts are evaluated live against the CRM.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{data.audiences.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No audiences yet. Create one to group consented contacts.
							</p>
						) : (
							data.audiences.map((audience) => (
								<AudienceRow
									key={audience.id}
									audience={audience}
									onEdit={() => setEditingId(audience.id)}
								/>
							))
						)}
					</CardContent>
				</Card>
				<AudienceEditor
					key={editing?.id ?? "new"}
					audience={editing}
					onDone={() => setEditingId(null)}
				/>
			</div>
		</div>
	);
}

function AudienceRow({
	audience,
	onEdit,
}: {
	audience: Audience;
	onEdit: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const archive = useMutation(
		trpc.marketingAudiences.archive.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Audience archived.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const exportToList = useMutation(
		trpc.marketingAudiences.exportToList.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				toast.success(
					`Exported to Listmonk list ${result.listId}: ${result.synced} added, ${result.existing} already present.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const archived = audience.status === "archived";

	return (
		<article className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="truncate font-medium">{audience.name}</h2>
					<Badge variant="outline">{audience.status}</Badge>
					<Badge variant="secondary">
						{formatNumber(audience.count)} contacts
					</Badge>
				</div>
				<p className="mt-1 truncate text-muted-foreground text-sm">
					{audience.description ?? describeRules(audience.rules)}
				</p>
				{audience.providerListId ? (
					<p className="mt-1 text-muted-foreground text-xs">
						Listmonk list {audience.providerListId}
					</p>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={onEdit}
					disabled={archived}
				>
					Edit
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => exportToList.mutate({ id: audience.id })}
					disabled={archived || exportToList.isPending}
				>
					Export to Listmonk
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => archive.mutate({ id: audience.id })}
					disabled={archived || archive.isPending}
				>
					<Icon icon={TrashCan} data-icon="inline-start" />
					Archive
				</Button>
			</div>
		</article>
	);
}

function AudienceEditor({
	audience,
	onDone,
}: {
	audience: Audience | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState(audience?.name ?? "");
	const [description, setDescription] = useState(audience?.description ?? "");
	const [consent, setConsent] = useState<Rules["consent"]>(
		audience?.rules.consent ?? "allowed",
	);
	const [sources, setSources] = useState<string[]>(
		audience?.rules.sources ?? [],
	);
	const [dealStages, setDealStages] = useState<string[]>(
		audience?.rules.dealStages ?? [],
	);
	const [bookingStatuses, setBookingStatuses] = useState<string[]>(
		audience?.rules.bookingStatuses ?? [],
	);
	const [resourceTypes, setResourceTypes] = useState<string[]>(
		audience?.rules.resourceTypes ?? [],
	);
	const [utmSources, setUtmSources] = useState(
		(audience?.rules.utmSources ?? []).join(", "),
	);
	const [utmCampaigns, setUtmCampaigns] = useState(
		(audience?.rules.utmCampaigns ?? []).join(", "),
	);
	const [cities, setCities] = useState(
		(audience?.rules.companyCities ?? []).join(", "),
	);
	const [countries, setCountries] = useState(
		(audience?.rules.companyCountries ?? []).join(", "),
	);
	const [createdAfter, setCreatedAfter] = useState(
		toDateInput(audience?.rules.createdAfter),
	);
	const [createdBefore, setCreatedBefore] = useState(
		toDateInput(audience?.rules.createdBefore),
	);
	const [lastActivityBefore, setLastActivityBefore] = useState(
		toDateInput(audience?.rules.lastActivityBefore),
	);
	const [minDealAmount, setMinDealAmount] = useState(
		audience?.rules.minDealAmount?.toString() ?? "",
	);
	const [hasBooking, setHasBooking] = useState(
		audience?.rules.hasBooking === undefined
			? "any"
			: audience.rules.hasBooking
				? "yes"
				: "no",
	);
	const [previewCount, setPreviewCount] = useState<number | null>(null);

	const create = useMutation(
		trpc.marketingAudiences.create.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Audience created.");
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.marketingAudiences.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Audience updated.");
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const countPreview = useMutation(
		trpc.marketingAudiences.count.mutationOptions({}),
	);

	const buildRules = (): Rules => {
		const rules: Rules = { consent };
		if (sources.length > 0)
			rules.sources = sources as NonNullable<Rules["sources"]>;
		if (dealStages.length > 0)
			rules.dealStages = dealStages as NonNullable<Rules["dealStages"]>;
		if (bookingStatuses.length > 0)
			rules.bookingStatuses = bookingStatuses as NonNullable<
				Rules["bookingStatuses"]
			>;
		if (resourceTypes.length > 0)
			rules.resourceTypes = resourceTypes as NonNullable<
				Rules["resourceTypes"]
			>;
		if (splitCsv(utmSources).length > 0)
			rules.utmSources = splitCsv(utmSources);
		if (splitCsv(utmCampaigns).length > 0)
			rules.utmCampaigns = splitCsv(utmCampaigns);
		if (splitCsv(cities).length > 0) rules.companyCities = splitCsv(cities);
		if (splitCsv(countries).length > 0)
			rules.companyCountries = splitCsv(countries);
		if (createdAfter) rules.createdAfter = new Date(createdAfter).toISOString();
		if (createdBefore)
			rules.createdBefore = new Date(createdBefore).toISOString();
		if (lastActivityBefore)
			rules.lastActivityBefore = new Date(lastActivityBefore).toISOString();
		if (minDealAmount) rules.minDealAmount = Number(minDealAmount);
		if (hasBooking !== "any") rules.hasBooking = hasBooking === "yes";
		return rules;
	};

	return (
		<Card className="min-w-0 self-start">
			<CardHeader>
				<CardTitle>
					{audience ? `Edit ${audience.name}` : "New audience"}
				</CardTitle>
				<CardDescription>
					Build the audience from CRM data. Consent defaults to explicit
					marketing consent.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="audience-name">Name</Label>
					<Input
						id="audience-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="audience-description">Description</Label>
					<Input
						id="audience-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="audience-consent">Consent</Label>
					<select
						id="audience-consent"
						className="h-8 rounded-md border bg-background px-2.5 text-xs"
						value={consent}
						onChange={(event) =>
							setConsent(event.target.value as Rules["consent"])
						}
					>
						<option value="allowed">Explicit marketing consent only</option>
						<option value="blocked">No consent or unsubscribed</option>
						<option value="any">Any consent state</option>
					</select>
				</div>

				<EnumPicker
					label="Contact source"
					options={RECORD_SOURCES}
					selected={sources}
					onChange={setSources}
				/>
				<EnumPicker
					label="Deal stage"
					options={DEAL_STAGES}
					selected={dealStages}
					onChange={setDealStages}
				/>
				<EnumPicker
					label="Booking status"
					options={BOOKING_STATUSES}
					selected={bookingStatuses}
					onChange={setBookingStatuses}
				/>
				<EnumPicker
					label="Booked service"
					options={RESOURCE_TYPES}
					selected={resourceTypes}
					onChange={setResourceTypes}
				/>

				<div className="grid gap-3 sm:grid-cols-2">
					<TextFilter
						id="utm-sources"
						label="UTM sources"
						value={utmSources}
						onChange={setUtmSources}
						placeholder="google, instagram"
					/>
					<TextFilter
						id="utm-campaigns"
						label="UTM campaigns"
						value={utmCampaigns}
						onChange={setUtmCampaigns}
						placeholder="spring-sale"
					/>
					<TextFilter
						id="cities"
						label="Company cities"
						value={cities}
						onChange={setCities}
						placeholder="London, Leeds"
					/>
					<TextFilter
						id="countries"
						label="Country codes"
						value={countries}
						onChange={setCountries}
						placeholder="GB, US"
					/>
					<TextFilter
						id="created-after"
						label="Created after"
						value={createdAfter}
						onChange={setCreatedAfter}
						type="date"
					/>
					<TextFilter
						id="created-before"
						label="Created before"
						value={createdBefore}
						onChange={setCreatedBefore}
						type="date"
					/>
					<TextFilter
						id="inactive-before"
						label="No activity since"
						value={lastActivityBefore}
						onChange={setLastActivityBefore}
						type="date"
					/>
					<TextFilter
						id="min-deal-amount"
						label="Minimum deal value"
						value={minDealAmount}
						onChange={setMinDealAmount}
						type="number"
						placeholder="1000"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="audience-has-booking">Booking</Label>
					<select
						id="audience-has-booking"
						className="h-8 rounded-md border bg-background px-2.5 text-xs"
						value={hasBooking}
						onChange={(event) => setHasBooking(event.target.value)}
					>
						<option value="any">Any booking state</option>
						<option value="yes">Has a booking</option>
						<option value="no">No booking yet</option>
					</select>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						onClick={async () => {
							try {
								const result = await countPreview.mutateAsync({
									rules: buildRules(),
								});
								setPreviewCount(result.count);
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : String(error),
								);
							}
						}}
					>
						<Icon icon={Checkmark} data-icon="inline-start" />
						Preview count
					</Button>
					{previewCount !== null ? (
						<Badge variant="secondary">
							{formatNumber(previewCount)} contacts
						</Badge>
					) : null}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => {
							if (!name.trim()) {
								toast.error("Name the audience.");
								return;
							}
							const payload = {
								name: name.trim(),
								description: description.trim() || undefined,
								rules: buildRules(),
							};
							if (audience) {
								update.mutate({ id: audience.id, ...payload });
							} else {
								create.mutate(payload);
							}
						}}
						disabled={create.isPending || update.isPending}
					>
						<Icon icon={Add} data-icon="inline-start" />
						{audience ? "Save changes" : "Create audience"}
					</Button>
					{audience ? (
						<Button variant="outline" onClick={onDone}>
							Cancel editing
						</Button>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function EnumPicker({
	label,
	options,
	selected,
	onChange,
}: {
	label: string;
	options: string[];
	selected: string[];
	onChange: (next: string[]) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<div className="flex flex-wrap gap-x-4 gap-y-2">
				{options.map((option) => (
					<Label
						key={option}
						htmlFor={`${label}-${option}`}
						className="flex items-center gap-1.5 text-xs font-normal"
					>
						<Checkbox
							id={`${label}-${option}`}
							checked={selected.includes(option)}
							onCheckedChange={(checked) =>
								onChange(
									checked === true
										? [...selected, option]
										: selected.filter((item) => item !== option),
								)
							}
						/>
						{option.replace(/_/g, " ")}
					</Label>
				))}
			</div>
		</div>
	);
}

function TextFilter({
	id,
	label,
	value,
	onChange,
	type = "text",
	placeholder,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	placeholder?: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}

function describeRules(rules: Audience["rules"]): string {
	const parts: string[] = [];
	if (rules.consent === "allowed") parts.push("consented");
	if (rules.consent === "blocked") parts.push("no consent");
	if (rules.dealStages?.length) parts.push(`${rules.dealStages.length} stages`);
	if (rules.bookingStatuses?.length)
		parts.push(`${rules.bookingStatuses.length} booking states`);
	if (rules.utmCampaigns?.length)
		parts.push(`campaigns: ${rules.utmCampaigns.join(", ")}`);
	if (rules.hasBooking === true) parts.push("has booking");
	if (rules.hasBooking === false) parts.push("no booking yet");
	if (rules.minDealAmount !== undefined)
		parts.push(`deal value ≥ ${formatNumber(rules.minDealAmount)}`);
	return parts.length > 0 ? parts.join(" · ") : "All active contacts";
}

function toDateInput(value: string | undefined): string {
	if (!value) return "";
	return value.slice(0, 10);
}

function splitCsv(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}
