"use client";

import Add from "@carbon/icons-react/es/Add";
import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import LinkIcon from "@carbon/icons-react/es/Link";
import Send from "@carbon/icons-react/es/Send";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import View from "@carbon/icons-react/es/View";
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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { TableCell } from "@crm/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	Field,
	formatMetric,
	formatNumber,
	IntegrationCard,
	Metric,
	optional,
	required,
	splitList,
} from "../marketing-workspaces";

type EmailOutput = RouterOutputs["marketing"]["email"];
type EmailCampaign = EmailOutput["campaigns"][number];
type EmailList = EmailOutput["lists"][number];
type PendingSchedule = EmailOutput["pendingSchedules"][number];
type EmailTemplate =
	RouterOutputs["marketingEmail"]["templates"]["templates"][number];
type EmailBlock = EmailTemplate["blocks"][number];

const CAMPAIGN_COLUMNS = [
	{ id: "name", header: "Campaign" },
	{ id: "status", header: "Status", width: "7rem" },
	{ id: "sent", header: "Sent", width: "5rem" },
	{ id: "opens", header: "Opens", width: "5rem" },
	{ id: "clicks", header: "Clicks", width: "5rem" },
	{ id: "bounces", header: "Bounces", width: "6rem" },
	{ id: "unsubscribes", header: "Unsubscribes", width: "8rem" },
];

const SUBSCRIBER_COLUMNS = [
	{ id: "email", header: "Email" },
	{ id: "name", header: "Name" },
	{ id: "status", header: "Status", width: "7rem" },
	{ id: "subscription", header: "Subscription", width: "9rem" },
];

export function EmailMarketingWorkspace() {
	const trpc = useTRPC();
	const email = useQuery(trpc.marketing.email.queryOptions());
	const templates = useQuery(trpc.marketingEmail.templates.queryOptions());

	if (
		email.isPending ||
		!email.data ||
		templates.isPending ||
		!templates.data
	) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const data = email.data;
	const configured = data.integration.configured;

	return (
		<Tabs defaultValue="overview">
			<TabsList>
				<TabsTrigger value="overview">Overview</TabsTrigger>
				<TabsTrigger value="campaigns">Campaigns</TabsTrigger>
				<TabsTrigger value="templates">Templates</TabsTrigger>
				<TabsTrigger value="lists">Lists</TabsTrigger>
				<TabsTrigger value="subscribers">Subscribers</TabsTrigger>
				<TabsTrigger value="performance">Performance</TabsTrigger>
			</TabsList>

			<TabsContent value="overview" className="mt-6">
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<div className="flex min-w-0 flex-col gap-6">
						<EmailStats data={data} />
						<PendingSchedulesCard schedules={data.pendingSchedules} />
					</div>
					<div className="flex min-w-0 flex-col gap-6">
						<IntegrationCard
							integration={data.integration}
							error={data.error}
						/>
						<ListmonkConnectionCard configured={configured} />
					</div>
				</div>
			</TabsContent>

			<TabsContent value="campaigns" className="mt-6">
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<CampaignsCard data={data} />
					<ComposeCampaignCard
						lists={data.lists}
						templates={templates.data.templates}
						disabled={!configured}
					/>
				</div>
			</TabsContent>

			<TabsContent value="templates" className="mt-6">
				<TemplatesTab templates={templates.data.templates} />
			</TabsContent>

			<TabsContent value="lists" className="mt-6">
				<ListsTab lists={data.lists} disabled={!configured} />
			</TabsContent>

			<TabsContent value="subscribers" className="mt-6">
				<SubscribersTab
					lists={data.lists}
					total={data.subscribers.total}
					disabled={!configured}
				/>
			</TabsContent>

			<TabsContent value="performance" className="mt-6">
				<PerformanceTab data={data} />
			</TabsContent>
		</Tabs>
	);
}

function EmailStats({ data }: { data: EmailOutput }) {
	return (
		<StatGroup>
			<StatCard
				label="Campaigns"
				value={data.campaigns.length}
				description="Returned from Listmonk"
			/>
			<StatCard
				label="Lists"
				value={data.lists.length}
				description={`${data.subscribers.total ?? 0} subscribers`}
			/>
			{data.metrics.slice(0, 2).map((metric) => (
				<StatCard
					key={metric.label}
					label={metric.label}
					value={metric.measured ? formatMetric(metric) : "—"}
					description={metric.unit}
				/>
			))}
		</StatGroup>
	);
}

function PendingSchedulesCard({ schedules }: { schedules: PendingSchedule[] }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const decide = useMutation(
		trpc.marketingEmail.decideSchedule.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				toast.success(
					result.status === "APPROVED"
						? "Schedule approved and applied in Listmonk."
						: "Schedule request rejected.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Pending schedule approvals</CardTitle>
				<CardDescription>
					Scheduling sends through Listmonk requires approval. Approving applies
					the schedule in Listmonk.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{schedules.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No schedule requests are waiting for approval.
					</p>
				) : (
					schedules.map((schedule) => (
						<article
							key={schedule.id}
							className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">
									{schedule.campaignName ?? `Campaign ${schedule.campaignId}`}
								</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{schedule.summary}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									onClick={() =>
										decide.mutate({
											approvalRequestId: schedule.id,
											decision: "APPROVE",
										})
									}
									disabled={decide.isPending}
								>
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										decide.mutate({
											approvalRequestId: schedule.id,
											decision: "REJECT",
										})
									}
									disabled={decide.isPending}
								>
									Reject
								</Button>
							</div>
						</article>
					))
				)}
			</CardContent>
		</Card>
	);
}

function ListmonkConnectionCard({ configured }: { configured: boolean }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const connect = useMutation(
		trpc.marketing.connectListmonk.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Listmonk connected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>
					{configured ? "Reconnect Listmonk" : "Connect Listmonk"}
				</CardTitle>
				<CardDescription>
					Credentials stay on the API server. The browser never sees them.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const authMethod =
							form.get("authMethod") === "token" ? "token" : "basic";
						connect.mutate({
							baseUrl: required(form, "baseUrl"),
							authMethod,
							username: optional(form, "username"),
							password: optional(form, "password"),
							token: optional(form, "token"),
						});
					}}
				>
					<Field
						name="baseUrl"
						label="Base URL"
						placeholder="https://mail.example.com"
					/>
					<label className="flex flex-col gap-1.5 text-xs font-medium">
						Auth Method
						<select
							name="authMethod"
							className="h-8 rounded-md border bg-background px-2.5 text-xs"
							defaultValue="basic"
						>
							<option value="basic">Basic</option>
							<option value="token">Token</option>
						</select>
					</label>
					<Field name="username" label="User" placeholder="listmonk" />
					<Field name="password" label="Password" type="password" />
					<Field name="token" label="Token" type="password" />
					<Button type="submit" disabled={connect.isPending}>
						<Icon icon={LinkIcon} data-icon="inline-start" />
						Connect
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function CampaignsCard({ data }: { data: EmailOutput }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sendTest = useMutation(
		trpc.marketing.sendListmonkTest.mutationOptions({
			onSuccess: () => toast.success("Test send requested."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const requestSchedule = useMutation(
		trpc.marketingEmail.requestSchedule.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Schedule approval requested.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const requestSend = useMutation(
		trpc.marketing.requestAction.mutationOptions({
			onSuccess: () => toast.success("Approval request created."),
			onError: (error) => toast.error(error.message),
		}),
	);

	const pendingByCampaign = new Map(
		data.pendingSchedules.map((schedule) => [schedule.campaignId, schedule]),
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Campaigns</CardTitle>
				<CardDescription>
					Listmonk campaigns. Sending and scheduling require approval.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{data.campaigns.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No campaigns are available from Listmonk.
					</p>
				) : (
					data.campaigns.map((campaign) => (
						<CampaignRow
							key={campaign.id}
							campaign={campaign}
							pendingSchedule={pendingByCampaign.get(campaign.id) ?? null}
							onSendTest={(recipients) =>
								sendTest.mutate({ campaignId: campaign.id, recipients })
							}
							onRequestSchedule={(sendAt) =>
								requestSchedule.mutate({
									campaignId: campaign.id,
									campaignName: campaign.name,
									sendAt,
								})
							}
							onRequestSend={() =>
								requestSend.mutate({
									provider: "LISTMONK",
									action: "campaign.send",
									summary: `Send ${campaign.name}`,
									payload: { campaignId: campaign.id },
								})
							}
							busy={
								sendTest.isPending ||
								requestSchedule.isPending ||
								requestSend.isPending
							}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function CampaignRow({
	campaign,
	pendingSchedule,
	onSendTest,
	onRequestSchedule,
	onRequestSend,
	busy,
}: {
	campaign: EmailCampaign;
	pendingSchedule: PendingSchedule | null;
	onSendTest: (recipients: string[]) => void;
	onRequestSchedule: (sendAt: string) => void;
	onRequestSend: () => void;
	busy: boolean;
}) {
	return (
		<article className="grid gap-3 rounded-lg border p-4">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<h2 className="truncate font-medium">{campaign.name}</h2>
				<Badge variant="outline">{campaign.status}</Badge>
				{pendingSchedule ? (
					<Badge variant="secondary">Schedule awaiting approval</Badge>
				) : null}
			</div>
			<p className="truncate text-muted-foreground text-sm">
				{campaign.subject ?? "No subject"}
			</p>
			<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
				<Metric label="Sent" value={campaign.sent} />
				<Metric label="Opens" value={campaign.opens} />
				<Metric label="Clicks" value={campaign.clicks} />
				<Metric label="Bounces" value={campaign.bounces} />
				<Metric label="Unsubscribes" value={campaign.unsubscribes} />
			</div>
			<div className="flex flex-wrap gap-2">
				<TestSendDialog busy={busy} onSubmit={onSendTest} />
				<ScheduleDialog
					busy={busy}
					disabled={campaign.status !== "draft" || pendingSchedule !== null}
					onSubmit={onRequestSchedule}
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={onRequestSend}
					disabled={busy}
				>
					<Icon icon={Send} data-icon="inline-start" />
					Request Send
				</Button>
			</div>
		</article>
	);
}

function TestSendDialog({
	busy,
	onSubmit,
}: {
	busy: boolean;
	onSubmit: (recipients: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" disabled={busy}>
					Send Test
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Send a test</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const recipients = splitList(required(form, "recipients"));
						if (recipients.length === 0) {
							toast.error("Add at least one recipient.");
							return;
						}
						onSubmit(recipients);
						setOpen(false);
					}}
				>
					<Field
						name="recipients"
						label="Recipients"
						placeholder="owner@example.com, qa@example.com"
					/>
					<DialogFooter>
						<Button type="submit" disabled={busy}>
							Send Test
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ScheduleDialog({
	busy,
	disabled,
	onSubmit,
}: {
	busy: boolean;
	disabled: boolean;
	onSubmit: (sendAt: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" disabled={busy || disabled}>
					Request Schedule
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Request a scheduled send</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const value = required(form, "sendAt");
						const sendAt = new Date(value);
						if (Number.isNaN(sendAt.getTime())) {
							toast.error("Pick a valid date and time.");
							return;
						}
						onSubmit(sendAt.toISOString());
						setOpen(false);
					}}
				>
					<Field name="sendAt" label="Send at" type="datetime-local" />
					<p className="text-muted-foreground text-xs">
						An approver must approve the request. Approving applies the schedule
						in Listmonk.
					</p>
					<DialogFooter>
						<Button type="submit" disabled={busy}>
							Request Approval
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ComposeCampaignCard({
	lists,
	templates,
	disabled,
}: {
	lists: EmailList[];
	templates: EmailTemplate[];
	disabled: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [selectedLists, setSelectedLists] = useState<number[]>([]);
	const compose = useMutation(
		trpc.marketingEmail.composeCampaign.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Draft campaign created in Listmonk.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const activeTemplates = templates.filter(
		(template) => template.status !== "archived",
	);

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>New campaign</CardTitle>
				<CardDescription>
					Create a draft campaign in Listmonk from a Comp AI template or raw
					HTML.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						if (selectedLists.length === 0) {
							toast.error("Select at least one list.");
							return;
						}
						const templateId = optional(form, "templateId");
						const body = optional(form, "body");
						if (!templateId && !body) {
							toast.error("Pick a template or provide raw HTML.");
							return;
						}
						compose.mutate({
							name: required(form, "name"),
							subject: required(form, "subject"),
							previewText: optional(form, "previewText"),
							fromEmail: optional(form, "fromEmail"),
							templateId,
							body: templateId ? undefined : body,
							listIds: selectedLists,
							tags: splitList(optional(form, "tags") ?? ""),
						});
					}}
				>
					<Field name="name" label="Name" />
					<Field name="subject" label="Subject" />
					<Field name="previewText" label="Preview text" />
					<Field
						name="fromEmail"
						label="Sender"
						placeholder="Studio <hello@example.com>"
					/>
					<label className="flex flex-col gap-1.5 text-xs font-medium">
						Template
						<select
							name="templateId"
							className="h-8 rounded-md border bg-background px-2.5 text-xs"
							defaultValue=""
						>
							<option value="">Raw HTML body</option>
							{activeTemplates.map((template) => (
								<option key={template.id} value={template.id}>
									{template.name}
								</option>
							))}
						</select>
					</label>
					<Label
						htmlFor="campaign-body"
						className="flex flex-col gap-1.5 text-xs font-medium"
					>
						Raw HTML body (used when no template is selected)
						<Textarea id="campaign-body" name="body" />
					</Label>
					<div className="flex flex-col gap-1.5">
						<Label>Audience lists</Label>
						{lists.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								No lists are available from Listmonk.
							</p>
						) : (
							lists.map((list) => (
								<Label
									key={list.id}
									htmlFor={`audience-list-${list.id}`}
									className="flex items-center gap-2 text-xs font-normal"
								>
									<Checkbox
										id={`audience-list-${list.id}`}
										checked={selectedLists.includes(list.id)}
										onCheckedChange={(checked) =>
											setSelectedLists((current) =>
												checked === true
													? [...current, list.id]
													: current.filter((id) => id !== list.id),
											)
										}
									/>
									{list.name} · {list.subscriberCount ?? 0} subscribers
								</Label>
							))
						)}
					</div>
					<Field name="tags" label="Tags" placeholder="spring, newsletter" />
					<Button type="submit" disabled={disabled || compose.isPending}>
						<Icon icon={Add} data-icon="inline-start" />
						Create Draft
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function TemplatesTab({ templates }: { templates: EmailTemplate[] }) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = templates.find((template) => template.id === selectedId);

	return (
		<div className="grid gap-6 xl:grid-cols-2">
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Comp AI templates</CardTitle>
					<CardDescription>
						Reusable block-based templates stored in Comp AI.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSelectedId(null)}
					>
						<Icon icon={Add} data-icon="inline-start" />
						New template
					</Button>
					{templates.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No templates yet. Create one to reuse across campaigns.
						</p>
					) : (
						templates.map((template) => (
							<button
								key={template.id}
								type="button"
								onClick={() => setSelectedId(template.id)}
								className="rounded-lg border p-3 text-left transition-colors hover:bg-muted"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate font-medium text-sm">
										{template.name}
									</p>
									<Badge variant="outline">{template.status}</Badge>
								</div>
								<p className="mt-1 truncate text-muted-foreground text-xs">
									{template.description ?? `${template.blocks.length} blocks`}
								</p>
							</button>
						))
					)}
				</CardContent>
			</Card>
			<TemplateEditor key={selected?.id ?? "new"} template={selected ?? null} />
		</div>
	);
}

type EditableBlock = { key: string; value: EmailBlock };

function editableBlocks(values: EmailBlock[]): EditableBlock[] {
	return values.map((value) => ({ key: crypto.randomUUID(), value }));
}

function TemplateEditor({ template }: { template: EmailTemplate | null }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState(template?.name ?? "");
	const [description, setDescription] = useState(template?.description ?? "");
	const [previewText, setPreviewText] = useState(template?.previewText ?? "");
	const [blocks, setBlocks] = useState<EditableBlock[]>(
		editableBlocks(
			template?.blocks ?? [
				{ kind: "header", text: "" },
				{ kind: "text", text: "" },
				{ kind: "unsubscribe" },
			],
		),
	);

	const create = useMutation(
		trpc.marketingEmail.createTemplate.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Template created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.marketingEmail.updateTemplate.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Template updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const archive = useMutation(
		trpc.marketingEmail.archiveTemplate.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Template archived.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const readOnly = template?.status === "archived";

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{template ? "Edit template" : "New template"}</CardTitle>
				<CardDescription>
					Blocks render to a simple HTML email. Nothing here is a page builder.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="template-name">Name</Label>
						<Input
							id="template-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							disabled={readOnly}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="template-preview">Preview text</Label>
						<Input
							id="template-preview"
							value={previewText}
							onChange={(event) => setPreviewText(event.target.value)}
							disabled={readOnly}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="template-description">Description</Label>
					<Input
						id="template-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						disabled={readOnly}
					/>
				</div>

				<BlockEditor blocks={blocks} onChange={setBlocks} readOnly={readOnly} />

				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => {
							if (!name.trim()) {
								toast.error("Name the template.");
								return;
							}
							const payload = {
								name: name.trim(),
								description: description.trim() || undefined,
								previewText: previewText.trim() || undefined,
								blocks: blocks.map((entry) => entry.value),
							};
							if (template) {
								update.mutate({ id: template.id, ...payload });
							} else {
								create.mutate(payload);
							}
						}}
						disabled={readOnly || create.isPending || update.isPending}
					>
						{template ? "Save changes" : "Create template"}
					</Button>
					{template ? (
						<>
							<TemplatePreviewDialog templateId={template.id} />
							<Button
								variant="outline"
								onClick={() => archive.mutate({ id: template.id })}
								disabled={readOnly || archive.isPending}
							>
								<Icon icon={TrashCan} data-icon="inline-start" />
								Archive
							</Button>
						</>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

const BLOCK_KINDS = [
	{ kind: "header", label: "Header" },
	{ kind: "image", label: "Image" },
	{ kind: "text", label: "Text" },
	{ kind: "cta", label: "CTA" },
	{ kind: "footer", label: "Footer" },
	{ kind: "unsubscribe", label: "Unsubscribe" },
] as const;

function defaultBlock(kind: EmailBlock["kind"]): EmailBlock {
	switch (kind) {
		case "header":
			return { kind: "header", text: "" };
		case "image":
			return { kind: "image", url: "" };
		case "text":
			return { kind: "text", text: "" };
		case "cta":
			return { kind: "cta", label: "", url: "" };
		case "footer":
			return { kind: "footer", text: "" };
		case "unsubscribe":
			return { kind: "unsubscribe" };
	}
}

function BlockEditor({
	blocks,
	onChange,
	readOnly,
}: {
	blocks: EditableBlock[];
	onChange: (blocks: EditableBlock[]) => void;
	readOnly: boolean;
}) {
	const update = (index: number, next: EmailBlock) =>
		onChange(
			blocks.map((entry, at) =>
				at === index ? { key: entry.key, value: next } : entry,
			),
		);
	const move = (index: number, direction: -1 | 1) => {
		const target = index + direction;
		if (target < 0 || target >= blocks.length) return;
		const next = [...blocks];
		const item = next[index];
		const swap = next[target];
		if (!item || !swap) return;
		next[index] = swap;
		next[target] = item;
		onChange(next);
	};

	return (
		<div className="flex flex-col gap-3">
			<Label>Blocks</Label>
			{blocks.map((entry, index) => (
				<div key={entry.key} className="rounded-md border p-3">
					<div className="mb-2 flex items-center justify-between gap-2">
						<Badge variant="secondary">{entry.value.kind}</Badge>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => move(index, -1)}
								disabled={readOnly || index === 0}
							>
								<Icon icon={ArrowUp} />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => move(index, 1)}
								disabled={readOnly || index === blocks.length - 1}
							>
								<Icon icon={ArrowDown} />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => onChange(blocks.filter((_, at) => at !== index))}
								disabled={readOnly || blocks.length <= 1}
							>
								<Icon icon={TrashCan} />
							</Button>
						</div>
					</div>
					<BlockFields
						block={entry.value}
						readOnly={readOnly}
						onChange={(next) => update(index, next)}
					/>
				</div>
			))}
			<div className="flex flex-wrap gap-2">
				{BLOCK_KINDS.map((entry) => (
					<Button
						key={entry.kind}
						variant="outline"
						size="sm"
						onClick={() =>
							onChange([
								...blocks,
								{ key: crypto.randomUUID(), value: defaultBlock(entry.kind) },
							])
						}
						disabled={readOnly}
					>
						<Icon icon={Add} data-icon="inline-start" />
						{entry.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function BlockFields({
	block,
	readOnly,
	onChange,
}: {
	block: EmailBlock;
	readOnly: boolean;
	onChange: (block: EmailBlock) => void;
}) {
	switch (block.kind) {
		case "header":
			return (
				<div className="grid gap-2">
					<Input
						placeholder="Heading"
						value={block.text}
						onChange={(event) =>
							onChange({ ...block, text: event.target.value })
						}
						disabled={readOnly}
					/>
					<Input
						placeholder="Subheading (optional)"
						value={block.subtext ?? ""}
						onChange={(event) =>
							onChange({
								...block,
								subtext: event.target.value || undefined,
							})
						}
						disabled={readOnly}
					/>
				</div>
			);
		case "image":
			return (
				<div className="grid gap-2">
					<Input
						placeholder="Image URL"
						value={block.url}
						onChange={(event) =>
							onChange({ ...block, url: event.target.value })
						}
						disabled={readOnly}
					/>
					<Input
						placeholder="Alt text (optional)"
						value={block.alt ?? ""}
						onChange={(event) =>
							onChange({ ...block, alt: event.target.value || undefined })
						}
						disabled={readOnly}
					/>
					<Input
						placeholder="Link URL (optional)"
						value={block.href ?? ""}
						onChange={(event) =>
							onChange({ ...block, href: event.target.value || undefined })
						}
						disabled={readOnly}
					/>
				</div>
			);
		case "text":
			return (
				<Textarea
					placeholder="Paragraph text. Blank lines split paragraphs."
					value={block.text}
					onChange={(event) => onChange({ ...block, text: event.target.value })}
					disabled={readOnly}
				/>
			);
		case "cta":
			return (
				<div className="grid gap-2">
					<Input
						placeholder="Button label"
						value={block.label}
						onChange={(event) =>
							onChange({ ...block, label: event.target.value })
						}
						disabled={readOnly}
					/>
					<Input
						placeholder="Button URL"
						value={block.url}
						onChange={(event) =>
							onChange({ ...block, url: event.target.value })
						}
						disabled={readOnly}
					/>
				</div>
			);
		case "footer":
			return (
				<Textarea
					placeholder="Footer text"
					value={block.text}
					onChange={(event) => onChange({ ...block, text: event.target.value })}
					disabled={readOnly}
				/>
			);
		case "unsubscribe":
			return (
				<Input
					placeholder="Unsubscribe"
					value={block.text ?? ""}
					onChange={(event) =>
						onChange({ ...block, text: event.target.value || undefined })
					}
					disabled={readOnly}
				/>
			);
	}
}

function TemplatePreviewDialog({ templateId }: { templateId: string }) {
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const preview = useQuery({
		...trpc.marketingEmail.renderTemplate.queryOptions({ id: templateId }),
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Icon icon={View} data-icon="inline-start" />
					Preview
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Template preview</DialogTitle>
				</DialogHeader>
				{preview.data ? (
					<iframe
						title="Email template preview"
						sandbox=""
						srcDoc={preview.data.html}
						className="h-[28rem] w-full rounded-md border bg-white"
					/>
				) : (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ListsTab({
	lists,
	disabled,
}: {
	lists: EmailList[];
	disabled: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const createList = useMutation(
		trpc.marketingEmail.createList.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("List created in Listmonk.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const syncList = useMutation(
		trpc.marketingEmail.syncList.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				toast.success(
					`Synced ${result.synced} contacts. ${result.existing} already present, ${result.consentBlocked} blocked by consent.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Listmonk lists</CardTitle>
					<CardDescription>
						Sync copies CRM contacts with explicit marketing consent. It never
						re-adds an unsubscribed subscriber.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{lists.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No lists are available from Listmonk.
						</p>
					) : (
						lists.map((list) => (
							<article
								key={list.id}
								className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto]"
							>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="truncate font-medium text-sm">{list.name}</p>
										<Badge variant="outline">{list.status}</Badge>
									</div>
									<p className="mt-1 text-muted-foreground text-xs">
										{list.subscriberCount ?? 0} subscribers · {list.type}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => syncList.mutate({ listId: list.id })}
									disabled={disabled || syncList.isPending}
								>
									Sync from CRM
								</Button>
							</article>
						))
					)}
				</CardContent>
			</Card>
			<Card className="min-w-0 self-start">
				<CardHeader>
					<CardTitle>New list</CardTitle>
					<CardDescription>
						Creates a private single opt-in list in Listmonk.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							createList.mutate({
								name: required(form, "name"),
								description: optional(form, "description"),
							});
						}}
					>
						<Field name="name" label="Name" />
						<Field name="description" label="Description" />
						<Button type="submit" disabled={disabled || createList.isPending}>
							<Icon icon={Add} data-icon="inline-start" />
							Create List
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function SubscribersTab({
	lists,
	total,
	disabled,
}: {
	lists: EmailList[];
	total: number | null;
	disabled: boolean;
}) {
	const trpc = useTRPC();
	const [listId, setListId] = useState<number | null>(null);
	const subscribers = useQuery({
		...trpc.marketingEmail.subscribers.queryOptions({
			listId: listId ?? undefined,
		}),
		enabled: !disabled,
	});

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Subscribers</CardTitle>
				<CardDescription>
					{total === null
						? "Subscriber state from Listmonk."
						: `${formatNumber(total)} subscribers in Listmonk.`}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<label className="flex max-w-xs flex-col gap-1.5 text-xs font-medium">
					Filter by list
					<select
						className="h-8 rounded-md border bg-background px-2.5 text-xs"
						value={listId === null ? "" : String(listId)}
						onChange={(event) =>
							setListId(
								event.target.value === "" ? null : Number(event.target.value),
							)
						}
					>
						<option value="">All lists</option>
						{lists.map((list) => (
							<option key={list.id} value={list.id}>
								{list.name}
							</option>
						))}
					</select>
				</label>
				{disabled ? (
					<p className="text-muted-foreground text-sm">
						Connect Listmonk to see subscribers.
					</p>
				) : subscribers.isPending || !subscribers.data ? (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				) : subscribers.data.subscribers.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No subscribers returned.
					</p>
				) : (
					<SimpleTable columns={SUBSCRIBER_COLUMNS} surface="page">
						{subscribers.data.subscribers.map((subscriber) => (
							<SimpleTableRow key={subscriber.id}>
								<TableCell>
									<p className="truncate text-sm">{subscriber.email}</p>
								</TableCell>
								<TableCell>
									<p className="truncate text-sm">{subscriber.name || "—"}</p>
								</TableCell>
								<TableCell>
									<Badge variant="outline">{subscriber.status}</Badge>
								</TableCell>
								<TableCell>
									<p className="text-muted-foreground text-xs">
										{subscriber.subscriptionStatus ?? "—"}
									</p>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</CardContent>
		</Card>
	);
}

function PerformanceTab({ data }: { data: EmailOutput }) {
	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				{data.metrics.map((metric) => (
					<StatCard
						key={metric.label}
						label={metric.label}
						value={metric.measured ? formatMetric(metric) : "—"}
						description={metric.measured ? metric.unit : "Not measured yet"}
					/>
				))}
			</StatGroup>
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>Campaign performance</CardTitle>
					<CardDescription>
						Real counters from Listmonk. Missing values stay empty.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.campaigns.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No campaigns are available from Listmonk.
						</p>
					) : (
						<SimpleTable columns={CAMPAIGN_COLUMNS} surface="page">
							{data.campaigns.map((campaign) => (
								<SimpleTableRow key={campaign.id}>
									<TableCell>
										<p className="truncate text-sm font-medium">
											{campaign.name}
										</p>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{campaign.status}</Badge>
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.sent === null ? "—" : formatNumber(campaign.sent)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.opens === null
											? "—"
											: formatNumber(campaign.opens)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.clicks === null
											? "—"
											: formatNumber(campaign.clicks)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.bounces === null
											? "—"
											: formatNumber(campaign.bounces)}
									</TableCell>
									<TableCell className="tabular-nums">
										{campaign.unsubscribes === null
											? "—"
											: formatNumber(campaign.unsubscribes)}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
