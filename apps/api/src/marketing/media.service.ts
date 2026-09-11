import { createHash } from "node:crypto";
import { type Db, type Prisma } from "@crm/db";
import { blobEnabled } from "@crm/db/blob";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import { MARKETING_MEDIA } from "./marketing-config";
import type { ListMediaInput, MediaAssetOutput } from "./media.contracts";

const ALLOWED_MIME_TYPES = new Set<string>(MARKETING_MEDIA.allowedMimeTypes);

@Injectable()
export class MarketingMediaService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(source: BusinessContextSource, input: ListMediaInput) {
		const context = await resolveBusinessContext(this.db, source);
		const where: Prisma.MarketingMediaAssetWhereInput = {
			businessUnitId: context.businessUnitId,
			archivedAt: null,
			campaignId: input.campaignId,
		};
		if (input.query) {
			where.fileName = { contains: input.query, mode: "insensitive" };
		}
		const rows = await this.db.marketingMediaAsset.findMany({
			where,
			orderBy: [{ createdAt: "desc" }],
			take: MARKETING_MEDIA.listLimit,
		});

		return { rows: rows.map(serialize) };
	}

	async upload(
		source: BusinessContextSource,
		input: { fileName: string; mimeType: string; bytes: Buffer },
	) {
		const context = await resolveBusinessContext(this.db, source);

		if (!blobEnabled()) {
			throw new BadRequestException(
				"Media storage is not configured. Set BLOB_READ_WRITE_TOKEN to enable the media library.",
			);
		}

		const mimeType = input.mimeType.toLowerCase();
		if (!ALLOWED_MIME_TYPES.has(mimeType)) {
			throw new BadRequestException(`Unsupported media type: ${mimeType}.`);
		}
		if (input.bytes.length === 0) {
			throw new BadRequestException("The upload is empty.");
		}
		if (input.bytes.length > MARKETING_MEDIA.maxUploadBytes) {
			throw new BadRequestException(
				`The upload exceeds ${MARKETING_MEDIA.maxUploadBytes} bytes.`,
			);
		}

		const sha256 = createHash("sha256").update(input.bytes).digest("hex");

		const existing = await this.db.marketingMediaAsset.findFirst({
			where: {
				businessUnitId: context.businessUnitId,
				sha256,
				archivedAt: null,
			},
		});
		if (existing) return { asset: serialize(existing), deduplicated: true };

		const { put } = await import("@vercel/blob");
		const safeName = sanitizeFileName(input.fileName);
		const blob = await put(
			`marketing/${context.businessUnitId}/${sha256.slice(0, 12)}-${safeName}`,
			input.bytes,
			{
				access: "public",
				contentType: mimeType,
				addRandomSuffix: false,
				allowOverwrite: true,
			},
		);

		const row = await this.db.marketingMediaAsset.create({
			data: {
				businessUnitId: context.businessUnitId,
				fileName: input.fileName,
				mimeType,
				sizeBytes: input.bytes.length,
				sha256,
				blobUrl: blob.url,
				uploadedById: source.userId,
			},
		});

		return { asset: serialize(row), deduplicated: false };
	}

	async archive(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingMediaAsset.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true },
		});
		if (!existing) throw new NotFoundException("Media asset not found.");

		const row = await this.db.marketingMediaAsset.update({
			where: { id: existing.id },
			data: { archivedAt: new Date() },
		});

		return serialize(row);
	}

	async attach(
		source: BusinessContextSource,
		input: { contentId: string; assetId: string; position?: number },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const [content, asset] = await Promise.all([
			this.db.marketingContent.findFirst({
				where: { id: input.contentId, businessUnitId: context.businessUnitId },
				select: { id: true },
			}),
			this.db.marketingMediaAsset.findFirst({
				where: {
					id: input.assetId,
					businessUnitId: context.businessUnitId,
					archivedAt: null,
				},
				select: { id: true },
			}),
		]);
		if (!content) throw new NotFoundException("Content not found.");
		if (!asset) throw new NotFoundException("Media asset not found.");

		await this.db.marketingContentMedia.upsert({
			where: {
				contentId_assetId: { contentId: content.id, assetId: asset.id },
			},
			create: {
				contentId: content.id,
				assetId: asset.id,
				position: input.position ?? 0,
			},
			update: { position: input.position ?? 0 },
		});

		return { ok: true };
	}

	async detach(
		source: BusinessContextSource,
		input: { contentId: string; assetId: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const content = await this.db.marketingContent.findFirst({
			where: { id: input.contentId, businessUnitId: context.businessUnitId },
			select: { id: true },
		});
		if (!content) throw new NotFoundException("Content not found.");

		await this.db.marketingContentMedia.deleteMany({
			where: { contentId: content.id, assetId: input.assetId },
		});

		return { ok: true };
	}
}

function sanitizeFileName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
	return cleaned.length > 0 ? cleaned : "upload";
}

type AssetRow = Prisma.MarketingMediaAssetGetPayload<object>;

function serialize(asset: AssetRow): MediaAssetOutput {
	return {
		id: asset.id,
		fileName: asset.fileName,
		mimeType: asset.mimeType,
		sizeBytes: asset.sizeBytes,
		width: asset.width,
		height: asset.height,
		durationSeconds: asset.durationSeconds,
		sha256: asset.sha256,
		blobUrl: asset.blobUrl,
		tags: parseTags(asset.tags),
		campaignId: asset.campaignId,
		uploadedById: asset.uploadedById,
		createdAt: asset.createdAt.toISOString(),
	};
}

function parseTags(value: Prisma.JsonValue): string[] {
	const parsed = z.array(z.string()).safeParse(value);
	return parsed.success ? parsed.data : [];
}
