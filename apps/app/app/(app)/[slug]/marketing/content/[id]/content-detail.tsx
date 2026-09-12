"use client";

import Add from "@carbon/icons-react/es/Add";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
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
import { Spinner } from "@crm/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Detail = RouterOutputs["marketingContent"]["detail"];
type Content = Detail["content"];
type Suggestion = NonNullable<Content["aiSuggestion"]>;

const PLATFORM_LABELS = {
	INSTAGRAM: "Instagram",
	FACEBOOK: "Facebook",
	LINKEDIN: "LinkedIn",
	TIKTOK: "TikTok",
	X: "X",
	EMAIL: "Email",
	BLOG: "Blog",
	WEBSITE: "Website",
} satisfies Record<Content["platforms"][number], string>;

const PLATFORM_CAPTION_LIMITS = {
	INSTAGRAM: 2200,
	FACEBOOK: 63_206,
	LINKEDIN: 3000,
	TIKTOK: 2200,
	X: 280,
	EMAIL: null,
	BLOG: null,
	WEBSITE: null,
} satisfies Record<Content["platforms"][number], number | null>;

const PLATFORM_OPTIONS = Object.keys(PLATFORM_LABELS) as Content["platforms"];

const STATUS_LABELS = {
	IDEA: "Idea",
	DRAFT: "Draft",
	PLANNED: "Planned",
	MEDIA_SELECTED: "Media selected",
	COPY_GENERATED: "Copy generated",
	DESIGN_GENERATED: "Design generated",
	READY_FOR_REVIEW: "In review",
	AWAITING_APPROVAL: "Awaiting approval",
	APPROVED: "Approved",
	SCHEDULED: "Scheduled",
	PUBLISHING: "Publishing",
	PUBLISHED: "Published",
	FAILED: "Failed",
	REJECTED: "Rejected",
	CANCELLED: "Cancelled",
	ARCHIVED: "Archived",
} satisfies Record<Content["status"], string>;

const TYPE_OPTIONS = [
	["SOCIAL_POST", "Social post"],
	["REEL", "Reel"],
	["STORY", "Story"],
	["STATIC_IMAGE", "Static image"],
	["CAROUSEL", "Carousel"],
	["EMAIL", "Email"],
	["AD_COPY", "Ad copy"],
	["BLOG", "Blog"],
	["LANDING_COPY", "Landing copy"],
	["PROMOTION", "Promotion"],
	["ANNOUNCEMENT", "Announcement"],
] as const;

export function ContentDetail({ id }: { id: string }) {
	const trpc = useTRPC();
	const detail = useQuery(trpc.marketingContent.detail.queryOptions({ id }));

	if (detail.isPending || !detail.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	return (
		<DetailEditor
			key={`${detail.data.content.id}:${detail.data.content.updatedAt}`}
			detail={detail.data}
		/>
	);
}

function DetailEditor({ detail }: { detail: Detail }) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const queryClient = useQueryClient();
	const { content, media, campaignName } = detail;

	const [title, setTitle] = useState(content.title);
	const [type, setType] = useState<Content["type"]>(content.type);
	const [platforms, setPlatforms] = useState<Content["platforms"]>(
		content.platforms,
	);
	const [caption, setCaption] = useState(content.caption ?? "");
	const [headline, setHeadline] = useState(content.headline ?? "");
	const [cta, setCta] = useState(content.cta ?? "");
	const [link, setLink] = useState(content.link ?? "");
	const [hashtags, setHashtags] = useState(content.hashtags.join(" "));
	const [notes, setNotes] = useState(content.internalNotes ?? "");
	const [instruction, setInstruction] = useState("");
	const [scheduleAt, setScheduleAt] = useState("");
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const [attachOpen, setAttachOpen] = useState(false);

	const editable =
		content.status !== "PUBLISHED" && content.status !== "ARCHIVED";

	const invalidate = async () => {
		await queryClient.invalidateQueries();
	};

	const update = useMutation(
		trpc.marketingContent.update.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Content saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submitReview = useMutation(
		trpc.marketingContent.submitForReview.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Sent for review.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const decide = useMutation(
		trpc.marketingContent.decide.mutationOptions({
			onSuccess: async (updated) => {
				await invalidate();
				toast.success(
					`Content ${STATUS_LABELS[updated.status].toLowerCase()}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const schedule = useMutation(
		trpc.marketingContent.schedule.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setScheduleOpen(false);
				toast.success("Content scheduled.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.marketingContent.archive.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Content archived.");
				router.push(workspaceUrl("/marketing/content"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const aiAssist = useMutation(
		trpc.marketingContent.aiAssist.mutationOptions({
			onSuccess: async (result) => {
				if (result.queued) {
					toast.success("AI drafting queued. Refresh in a moment to see it.");
				} else {
					toast.message("A draft is already being prepared.");
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const attach = useMutation(
		trpc.marketingMedia.attach.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setAttachOpen(false);
				toast.success("Media attached.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const detach = useMutation(
		trpc.marketingMedia.detach.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Media detached.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = () => {
		if (!title.trim()) {
			toast.error("Title is required.");
			return;
		}
		update.mutate({
			id: content.id,
			title: title.trim(),
			type,
			platforms,
			caption: caption || null,
			headline: headline.trim() || null,
			cta: cta.trim() || null,
			link: link.trim() || null,
			hashtags: hashtags
				.split(/[\s,]+/)
				.map((tag) => tag.replace(/^#/, "").trim())
				.filter(Boolean),
			internalNotes: notes || null,
		});
	};

	const applySuggestion = (suggestion: Suggestion) => {
		setCaption(suggestion.caption);
		if (suggestion.headline !== null) setHeadline(suggestion.headline);
		if (suggestion.hashtags.length > 0)
			setHashtags(suggestion.hashtags.join(" "));
		toast.success("Suggestion applied. Save to keep it.");
	};

	return (
		<div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
			<div className="flex min-w-0 flex-col gap-4">
				<Card>
					<CardHeader className="flex-row items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<CardTitle className="text-base">{content.title}</CardTitle>
							<Badge variant="outline">{STATUS_LABELS[content.status]}</Badge>
						</div>
						{campaignName ? (
							<span className="text-muted-foreground text-xs">
								Campaign: {campaignName}
							</span>
						) : null}
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="title">Title</Label>
								<Input
									id="title"
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									disabled={!editable}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>Type</Label>
								<Select
									value={type}
									onValueChange={(value) => setType(value as Content["type"])}
									disabled={!editable}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TYPE_OPTIONS.map(([value, label]) => (
											<SelectItem key={value} value={value}>
												{label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>Platforms</Label>
							<div className="flex flex-wrap gap-3">
								{PLATFORM_OPTIONS.map((platform) => (
									<label
										key={platform}
										htmlFor={`platform-${platform}`}
										className="flex items-center gap-1.5 text-sm"
									>
										<Checkbox
											id={`platform-${platform}`}
											checked={platforms.includes(platform)}
											disabled={!editable}
											onCheckedChange={(checked) =>
												setPlatforms((current) =>
													checked
														? [...current, platform]
														: current.filter((entry) => entry !== platform),
												)
											}
										/>
										{PLATFORM_LABELS[platform]}
									</label>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="caption">Caption</Label>
							<Textarea
								id="caption"
								rows={6}
								value={caption}
								onChange={(event) => setCaption(event.target.value)}
								disabled={!editable}
							/>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="headline">Headline</Label>
								<Input
									id="headline"
									value={headline}
									onChange={(event) => setHeadline(event.target.value)}
									disabled={!editable}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cta">Call to action</Label>
								<Input
									id="cta"
									value={cta}
									onChange={(event) => setCta(event.target.value)}
									disabled={!editable}
								/>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="link">Link</Label>
								<Input
									id="link"
									type="url"
									value={link}
									onChange={(event) => setLink(event.target.value)}
									disabled={!editable}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="hashtags">Hashtags</Label>
								<Input
									id="hashtags"
									value={hashtags}
									onChange={(event) => setHashtags(event.target.value)}
									placeholder="summer sale opening"
									disabled={!editable}
								/>
							</div>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="notes">Internal notes</Label>
							<Textarea
								id="notes"
								rows={2}
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								disabled={!editable}
							/>
						</div>

						{editable ? (
							<div className="flex justify-end">
								<Button onClick={save} disabled={update.isPending}>
									Save changes
								</Button>
							</div>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Platform preview</CardTitle>
					</CardHeader>
					<CardContent>
						{platforms.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Choose at least one platform to preview the caption against its
								limits.
							</p>
						) : (
							<Tabs defaultValue={platforms[0]}>
								<TabsList>
									{platforms.map((platform) => (
										<TabsTrigger key={platform} value={platform}>
											{PLATFORM_LABELS[platform]}
										</TabsTrigger>
									))}
								</TabsList>
								{platforms.map((platform) => {
									const limit = PLATFORM_CAPTION_LIMITS[platform] ?? null;
									const over = limit !== null && caption.length > limit;
									return (
										<TabsContent key={platform} value={platform}>
											<div className="flex flex-col gap-2 rounded-md border p-3">
												{headline ? (
													<p className="font-medium text-sm">{headline}</p>
												) : null}
												<p className="whitespace-pre-wrap text-sm">
													{caption || "Nothing written yet."}
												</p>
												<p
													className={
														over
															? "text-destructive text-xs"
															: "text-muted-foreground text-xs"
													}
												>
													{caption.length}
													{limit !== null ? ` / ${limit}` : ""} characters
													{over ? " — over the limit" : ""}
												</p>
											</div>
										</TabsContent>
									);
								})}
							</Tabs>
						)}
						<p className="mt-3 text-muted-foreground text-xs">
							Publishing integration is not configured yet. Scheduled content
							waits here until a channel is connected — nothing publishes
							automatically.
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex-row items-center justify-between gap-3">
						<CardTitle className="text-base">Media</CardTitle>
						<Dialog open={attachOpen} onOpenChange={setAttachOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm">
									<Icon icon={Add} data-icon="inline-start" />
									Attach
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Attach media</DialogTitle>
									<DialogDescription>
										Pick an asset from the media library.
									</DialogDescription>
								</DialogHeader>
								<MediaPicker
									attached={media.map((entry) => entry.assetId)}
									pending={attach.isPending}
									onPick={(assetId) =>
										attach.mutate({ contentId: content.id, assetId })
									}
								/>
							</DialogContent>
						</Dialog>
					</CardHeader>
					<CardContent>
						{media.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No media attached. Upload assets in the{" "}
								<Link
									href={workspaceUrl("/marketing/media")}
									className="underline"
								>
									media library
								</Link>
								.
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{media.map((entry) => (
									<li
										key={entry.assetId}
										className="flex items-center justify-between gap-3 rounded-md border p-2"
									>
										<div className="flex min-w-0 items-center gap-2">
											{entry.mimeType.startsWith("image/") && entry.blobUrl ? (
												<Image
													src={entry.blobUrl}
													alt={entry.fileName}
													width={40}
													height={40}
													unoptimized
													className="size-10 rounded object-cover"
												/>
											) : null}
											<span className="truncate text-sm">{entry.fileName}</span>
											<span className="text-muted-foreground text-xs">
												{formatSize(entry.sizeBytes)}
											</span>
										</div>
										<Button
											variant="ghost"
											size="sm"
											disabled={detach.isPending}
											onClick={() =>
												detach.mutate({
													contentId: content.id,
													assetId: entry.assetId,
												})
											}
										>
											<Icon icon={Close} data-icon="inline-start" />
											Detach
										</Button>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="flex min-w-0 flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Actions</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{["IDEA", "DRAFT", "REJECTED"].includes(content.status) ? (
							<Button
								variant="outline"
								disabled={submitReview.isPending}
								onClick={() => submitReview.mutate({ id: content.id })}
							>
								Submit for review
							</Button>
						) : null}
						{content.status === "READY_FOR_REVIEW" ? (
							<>
								<Button
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({ id: content.id, decision: "APPROVE" })
									}
								>
									<Icon icon={Checkmark} data-icon="inline-start" />
									Approve
								</Button>
								<Button
									variant="outline"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({
											id: content.id,
											decision: "REQUEST_CHANGES",
										})
									}
								>
									Request changes
								</Button>
								<Button
									variant="outline"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({ id: content.id, decision: "REJECT" })
									}
								>
									Reject
								</Button>
							</>
						) : null}
						{content.status === "APPROVED" ? (
							<Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
								<DialogTrigger asChild>
									<Button>Schedule</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Schedule content</DialogTitle>
										<DialogDescription>
											The content waits in the queue until a publishing channel
											is connected. Nothing publishes automatically.
										</DialogDescription>
									</DialogHeader>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="scheduleAt">Publish at</Label>
										<Input
											id="scheduleAt"
											type="datetime-local"
											value={scheduleAt}
											onChange={(event) => setScheduleAt(event.target.value)}
										/>
									</div>
									<DialogFooter>
										<Button
											disabled={schedule.isPending || !scheduleAt}
											onClick={() =>
												schedule.mutate({
													id: content.id,
													scheduledAt: new Date(scheduleAt).toISOString(),
												})
											}
										>
											Schedule
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						) : null}
						{content.scheduledAt ? (
							<p className="text-muted-foreground text-xs">
								Scheduled for{" "}
								{new Date(content.scheduledAt).toLocaleString(undefined, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
								.
							</p>
						) : null}
						{editable && content.status !== "PUBLISHED" ? (
							<Button
								variant="ghost"
								disabled={archive.isPending}
								onClick={() => archive.mutate({ id: content.id })}
							>
								Archive
							</Button>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">AI drafting</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<Textarea
							rows={3}
							placeholder="What should this say? e.g. announce the winter opening hours"
							value={instruction}
							onChange={(event) => setInstruction(event.target.value)}
						/>
						<Button
							variant="outline"
							disabled={aiAssist.isPending}
							onClick={() => aiAssist.mutate({ id: content.id, instruction })}
						>
							<Icon icon={MagicWand} data-icon="inline-start" />
							Draft with AI
						</Button>
						{content.aiSuggestion ? (
							<SuggestionPanel
								suggestion={content.aiSuggestion}
								onApply={applySuggestion}
							/>
						) : (
							<p className="text-muted-foreground text-xs">
								No suggestion yet. Drafts use your Business Brain knowledge and
								never change the status — you stay in charge of review.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function SuggestionPanel({
	suggestion,
	onApply,
}: {
	suggestion: Suggestion;
	onApply: (suggestion: Suggestion) => void;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-md border p-3">
			<p className="whitespace-pre-wrap text-sm">{suggestion.caption}</p>
			{suggestion.headline ? (
				<p className="font-medium text-xs">{suggestion.headline}</p>
			) : null}
			{suggestion.hashtags.length > 0 ? (
				<p className="text-muted-foreground text-xs">
					{suggestion.hashtags.map((tag) => `#${tag}`).join(" ")}
				</p>
			) : null}
			{suggestion.variants.length > 0 ? (
				<div className="flex flex-col gap-1">
					<p className="font-medium text-xs">Variants</p>
					{suggestion.variants.map((variant) => (
						<p
							key={variant}
							className="whitespace-pre-wrap rounded border p-2 text-muted-foreground text-xs"
						>
							{variant}
						</p>
					))}
				</div>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs">
					{suggestion.model}
				</span>
				<Button size="sm" variant="outline" onClick={() => onApply(suggestion)}>
					Apply
				</Button>
			</div>
		</div>
	);
}

function MediaPicker({
	attached,
	pending,
	onPick,
}: {
	attached: string[];
	pending: boolean;
	onPick: (assetId: string) => void;
}) {
	const trpc = useTRPC();
	const list = useQuery(trpc.marketingMedia.list.queryOptions({}));

	if (list.isPending || !list.data) {
		return (
			<div className="flex justify-center py-6">
				<Spinner />
			</div>
		);
	}

	const available = list.data.rows.filter(
		(asset) => !attached.includes(asset.id),
	);

	if (available.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				The media library is empty. Upload assets there first.
			</p>
		);
	}

	return (
		<ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
			{available.map((asset) => (
				<li
					key={asset.id}
					className="flex items-center justify-between gap-3 rounded-md border p-2"
				>
					<span className="truncate text-sm">{asset.fileName}</span>
					<Button
						size="sm"
						variant="outline"
						disabled={pending}
						onClick={() => onPick(asset.id)}
					>
						Attach
					</Button>
				</li>
			))}
		</ul>
	);
}

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}
