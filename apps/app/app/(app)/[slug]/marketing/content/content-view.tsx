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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type ContentItem = RouterOutputs["marketingContent"]["list"]["rows"][number];

const STATUS_FILTERS = [
	"ALL",
	"IDEA",
	"DRAFT",
	"READY_FOR_REVIEW",
	"APPROVED",
	"SCHEDULED",
	"PUBLISHED",
	"REJECTED",
] as const;

const STATUS_LABELS = {
	ALL: "All statuses",
	IDEA: "Idea",
	DRAFT: "Draft",
	READY_FOR_REVIEW: "In review",
	APPROVED: "Approved",
	SCHEDULED: "Scheduled",
	PUBLISHED: "Published",
	REJECTED: "Rejected",
	ARCHIVED: "Archived",
} satisfies Record<ContentItem["status"] | "ALL", string>;

const TYPE_LABELS = {
	SOCIAL_POST: "Social post",
	REEL: "Reel",
	STORY: "Story",
	STATIC_IMAGE: "Static image",
	CAROUSEL: "Carousel",
	EMAIL: "Email",
	AD_COPY: "Ad copy",
	BLOG: "Blog",
	LANDING_COPY: "Landing copy",
	PROMOTION: "Promotion",
	ANNOUNCEMENT: "Announcement",
} satisfies Record<ContentItem["type"], string>;

const PLATFORM_LABELS = {
	INSTAGRAM: "Instagram",
	FACEBOOK: "Facebook",
	LINKEDIN: "LinkedIn",
	TIKTOK: "TikTok",
	X: "X",
	EMAIL: "Email",
	BLOG: "Blog",
	WEBSITE: "Website",
} satisfies Record<ContentItem["platforms"][number], string>;

const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as ContentItem["type"][];

const COLUMNS = [
	{ id: "title", header: "Content" },
	{ id: "type", header: "Type", width: "8rem" },
	{ id: "status", header: "Status", width: "7rem" },
	{ id: "platforms", header: "Platforms" },
	{ id: "scheduled", header: "Scheduled", width: "8rem" },
	{ id: "updated", header: "Updated", width: "7rem" },
];

export function ContentView() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
	const [open, setOpen] = useState(false);

	const list = useQuery(
		trpc.marketingContent.list.queryOptions(status === "ALL" ? {} : { status }),
	);

	const create = useMutation(
		trpc.marketingContent.create.mutationOptions({
			onSuccess: async (content) => {
				await queryClient.invalidateQueries();
				setOpen(false);
				toast.success("Content created.");
				router.push(workspaceUrl(`/marketing/content/${content.id}`));
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
								{STATUS_LABELS[entry]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<Icon icon={Add} data-icon="inline-start" />
							New content
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>New content</DialogTitle>
							<DialogDescription>
								Draft a post, email or campaign copy. Nothing publishes without
								approval.
							</DialogDescription>
						</DialogHeader>
						<form
							className="flex flex-col gap-3"
							onSubmit={(event: FormEvent<HTMLFormElement>) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								const title = textValue(form, "title");
								if (!title) {
									toast.error("Title is required.");
									return;
								}
								create.mutate({
									title,
									type:
										(textValue(form, "type") as ContentItem["type"]) ||
										"SOCIAL_POST",
								});
							}}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="title">Title</Label>
								<Input id="title" name="title" required />
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="type">Type</Label>
								<Select name="type" defaultValue="SOCIAL_POST">
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TYPE_OPTIONS.map((entry) => (
											<SelectItem key={entry} value={entry}>
												{TYPE_LABELS[entry]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<DialogFooter>
								<Button type="submit" disabled={create.isPending}>
									<Icon icon={Add} data-icon="inline-start" />
									Create content
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<Card className="min-w-0">
				<CardContent className="p-0">
					{list.data.rows.length === 0 ? (
						<p className="p-6 text-muted-foreground text-sm">
							No content yet. Create a draft to start planning posts, emails and
							campaign copy.
						</p>
					) : (
						<SimpleTable columns={COLUMNS} surface="page">
							{list.data.rows.map((content) => (
								<ContentRow key={content.id} content={content} />
							))}
						</SimpleTable>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function ContentRow({ content }: { content: ContentItem }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<SimpleTableRow>
			<TableCell>
				<Link
					href={workspaceUrl(`/marketing/content/${content.id}`)}
					className="font-medium hover:underline"
				>
					{content.title}
				</Link>
				{content.aiAssisted ? (
					<p className="mt-0.5 text-muted-foreground text-xs">AI assisted</p>
				) : null}
			</TableCell>
			<TableCell className="text-xs">{TYPE_LABELS[content.type]}</TableCell>
			<TableCell>
				<Badge variant="outline">{STATUS_LABELS[content.status]}</Badge>
			</TableCell>
			<TableCell className="text-xs">
				{content.platforms.length === 0 ? (
					<EmptyCellValue />
				) : (
					content.platforms
						.map((platform) => PLATFORM_LABELS[platform])
						.join(", ")
				)}
			</TableCell>
			<TableCell className="text-xs tabular-nums">
				{content.scheduledAt ? (
					formatDay(content.scheduledAt)
				) : (
					<EmptyCellValue />
				)}
			</TableCell>
			<TableCell className="text-xs tabular-nums">
				{formatDay(content.updatedAt)}
			</TableCell>
		</SimpleTableRow>
	);
}

function textValue(form: FormData, name: string): string {
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
