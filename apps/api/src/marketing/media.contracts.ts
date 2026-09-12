import { z } from "zod";

export const mediaAssetOutput = z.object({
	id: z.string(),
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number(),
	width: z.number().nullable(),
	height: z.number().nullable(),
	durationSeconds: z.number().nullable(),
	sha256: z.string().nullable(),
	blobUrl: z.string(),
	tags: z.array(z.string()),
	campaignId: z.string().nullable(),
	uploadedById: z.string().nullable(),
	createdAt: z.string(),
});

export const listMediaInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	query: z.string().trim().max(120).optional(),
	campaignId: z.string().trim().min(1).optional(),
});

export const mediaListOutput = z.object({
	rows: z.array(mediaAssetOutput),
});

export const attachMediaInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	contentId: z.string().trim().min(1),
	assetId: z.string().trim().min(1),
	position: z.number().int().min(0).max(99).optional(),
});

export const detachMediaInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	contentId: z.string().trim().min(1),
	assetId: z.string().trim().min(1),
});

export const archiveMediaInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export type ListMediaInput = z.input<typeof listMediaInput>;
export type MediaAssetOutput = z.infer<typeof mediaAssetOutput>;
