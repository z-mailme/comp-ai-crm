import { type auth, SESSION_COOKIE_NAME } from "@crm/auth";
import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Query,
	Res,
	StreamableFile,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { FinanceService } from "./finance.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Finance")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/finance/documents")
export class FinanceDocumentsController {
	constructor(private readonly finance: FinanceService) {}

	@Get(":kind/:id.pdf")
	@ApiOperation({ summary: "Download a finance document PDF" })
	@ApiParam({ name: "kind", enum: ["quotes", "invoices"] })
	@ApiParam({ name: "id", description: "Quote or invoice id." })
	@ApiOkResponse({ description: "The generated PDF." })
	async read(
		@Param("kind") kind: "quotes" | "invoices",
		@Param("id") id: string,
		@Query("businessUnitId") businessUnitId: string | undefined,
		@Session() session: CrmSession,
		@Res({ passthrough: true }) response: Response,
	) {
		if (kind !== "quotes" && kind !== "invoices") {
			throw new BadRequestException(
				"Document kind must be quotes or invoices.",
			);
		}
		const document = await this.finance.documentPdf(
			{ userId: session.user.id, businessUnitId },
			kind,
			id,
		);

		response.setHeader("Cache-Control", "private, no-store");
		response.setHeader(
			"Content-Length",
			document.content.byteLength.toString(),
		);
		response.setHeader("Content-Type", "application/pdf");
		response.setHeader(
			"Content-Disposition",
			`inline; filename*=UTF-8''${encodeHeaderValue(document.filename)}`,
		);
		response.setHeader("X-Content-Type-Options", "nosniff");

		return new StreamableFile(document.content);
	}
}

function encodeHeaderValue(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}
