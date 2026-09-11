"use client";

import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Asset = RouterOutputs["marketingMedia"]["list"]["rows"][number];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function MediaView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [uploading, setUploading] = useState(false);

	const list = useQuery(trpc.marketingMedia.list.queryOptions({}));

	const archive = useMutation(
		trpc.marketingMedia.archive.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Asset archived.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const upload = async (file: File) => {
		if (file.size > MAX_UPLOAD_BYTES) {
			toast.error("The file is larger than 25 MB.");
			return;
		}
		setUploading(true);
		try {
			const params = new URLSearchParams({
				fileName: file.name,
				mimeType: file.type || "application/octet-stream",
			});
			const response = await fetch(`/api/marketing/media?${params}`, {
				method: "POST",
				body: file,
				credentials: "include",
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(body?.message ?? `Upload failed (${response.status}).`);
			}
			const result = (await response.json()) as {
				asset: Asset;
				deduplicated: boolean;
			};
			await queryClient.invalidateQueries();
			toast.success(
				result.deduplicated
					? "This file already exists in the library."
					: "Upload complete.",
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Upload failed.");
		} finally {
			setUploading(false);
			if (fileInput.current) fileInput.current.value = "";
		}
	};

	if (list.isPending || !list.data) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const rows = list.data.rows.filter((asset) =>
		query
			? asset.fileName.toLowerCase().includes(query.trim().toLowerCase())
			: true,
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Input
					className="w-64"
					placeholder="Search by file name"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div>
					<input
						ref={fileInput}
						type="file"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void upload(file);
						}}
					/>
					<Button
						disabled={uploading}
						onClick={() => fileInput.current?.click()}
					>
						<Icon icon={Upload} data-icon="inline-start" />
						{uploading ? "Uploading…" : "Upload"}
					</Button>
				</div>
			</div>

			{rows.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-muted-foreground text-sm">
						{list.data.rows.length === 0
							? "The library is empty. Upload images or videos to use them in content and campaigns."
							: "Nothing matches that search."}
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{rows.map((asset) => (
						<AssetCard
							key={asset.id}
							asset={asset}
							pending={archive.isPending}
							onArchive={() => archive.mutate({ id: asset.id })}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function AssetCard({
	asset,
	pending,
	onArchive,
}: {
	asset: Asset;
	pending: boolean;
	onArchive: () => void;
}) {
	return (
		<Card className="min-w-0 overflow-hidden">
			<div className="relative flex aspect-square items-center justify-center bg-muted">
				{asset.mimeType.startsWith("image/") && asset.blobUrl ? (
					<Image
						src={asset.blobUrl}
						alt={asset.fileName}
						fill
						unoptimized
						sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
						className="object-cover"
					/>
				) : (
					<span className="px-2 text-center text-muted-foreground text-xs">
						{asset.mimeType}
					</span>
				)}
			</div>
			<CardContent className="flex flex-col gap-1 p-3">
				<p className="truncate font-medium text-sm" title={asset.fileName}>
					{asset.fileName}
				</p>
				<p className="text-muted-foreground text-xs">
					{formatSize(asset.sizeBytes)} · {formatDay(asset.createdAt)}
				</p>
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					disabled={pending}
					onClick={onArchive}
				>
					Archive
				</Button>
			</CardContent>
		</Card>
	);
}

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

function formatDay(value: string): string {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
