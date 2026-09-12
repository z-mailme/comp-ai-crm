import type { IncomingMessage } from "node:http";
import { type auth, SESSION_COOKIE_NAME } from "@crm/auth";
import {
	BadRequestException,
	Controller,
	HttpCode,
	Post,
	Query,
	Req,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { MARKETING_MEDIA } from "./marketing-config";
import { MarketingMediaService } from "./media.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Marketing")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/marketing/media")
export class MarketingMediaController {
	constructor(private readonly media: MarketingMediaService) {}

	@Post()
	@HttpCode(200)
	@ApiOperation({ summary: "Upload a media asset for the media library" })
	@ApiQuery({
		name: "fileName",
		required: true,
		description: "Original file name.",
	})
	@ApiQuery({
		name: "mimeType",
		required: true,
		description: "MIME type of the upload.",
	})
	@ApiQuery({
		name: "businessUnitId",
		required: false,
		description: "Business unit override; defaults to the caller's unit.",
	})
	@ApiOkResponse({ description: "The stored (or deduplicated) asset." })
	async upload(
		@Session() session: CrmSession,
		@Req() request: IncomingMessage,
		@Query("fileName") fileName?: string,
		@Query("mimeType") mimeType?: string,
		@Query("businessUnitId") businessUnitId?: string,
	) {
		if (!fileName?.trim()) {
			throw new BadRequestException("fileName is required.");
		}
		if (!mimeType?.trim()) {
			throw new BadRequestException("mimeType is required.");
		}

		const bytes = await readBytes(request, MARKETING_MEDIA.maxUploadBytes);
		if (!bytes) {
			throw new BadRequestException(
				`The upload is empty or exceeds ${MARKETING_MEDIA.maxUploadBytes} bytes.`,
			);
		}

		return this.media.upload(
			{ userId: session.user.id, businessUnitId: businessUnitId ?? null },
			{ fileName: fileName.trim(), mimeType: mimeType.trim(), bytes },
		);
	}
}

async function readBytes(
	request: IncomingMessage,
	limit: number,
): Promise<Buffer | null> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;

		const finish = (value: Buffer | null) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > limit) {
				request.destroy();
				finish(null);
				return;
			}
			chunks.push(chunk);
		});

		request.on("end", () => finish(size === 0 ? null : Buffer.concat(chunks)));
		request.on("error", () => finish(null));
	});
}
