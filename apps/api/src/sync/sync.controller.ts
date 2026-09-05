import {
	BadRequestException,
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
	Query,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	ApiExcludeEndpoint,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { gmailBackfillInput } from "../google/gmail-backfill";
import { GmailHistoricalImportService } from "../google/gmail-historical-import.service";
import { GoogleSyncService } from "../google/google-sync.service";
import { MailboxSyncService } from "./mailbox-sync.service";

@ApiTags("Internal — Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/sync")
export class SyncController {
	private readonly logger = new Logger(SyncController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly sync: MailboxSyncService,
		private readonly google: GoogleSyncService,
		private readonly historicalImport: GmailHistoricalImportService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("mailboxes")
	@AllowAnonymous()
	@ApiOperation({ summary: "Run any due Gmail, Outlook or calendar sync" })
	@ApiOkResponse({ description: "The sync ran; per-mailbox results." })
	async mailboxesViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("mailboxes")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async mailboxesViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Get("google")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Alias of `mailboxes`, kept for existing cron deployments",
	})
	@ApiOkResponse({ description: "The sync ran; per-mailbox results." })
	async googleViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("google")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async googleViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("gmail/backfill")
	@AllowAnonymous()
	@ApiOperation({ summary: "Run a bounded Gmail historical backfill" })
	@ApiOkResponse({
		description:
			"The bounded Gmail backfill ran, or dry-run counted candidates.",
	})
	async gmailBackfill(
		@Headers("authorization") authorization?: string,
		@Query() query?: Record<string, unknown>,
	) {
		this.authorize(authorization);

		const parsed = gmailBackfillInput.safeParse(query ?? {});
		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues.map((issue) => issue.message).join(" "),
			);
		}

		return this.google.backfillGmail(parsed.data);
	}

	@Post("gmail/historical-import/tick")
	@AllowAnonymous()
	@ApiOperation({ summary: "Run one due Gmail historical import job step" })
	@ApiOkResponse({
		description:
			"The historical import tick planned, processed or verified one chunk.",
	})
	async gmailHistoricalImportTick(
		@Headers("authorization") authorization?: string,
	) {
		this.authorize(authorization);

		return this.historicalImport.tick();
	}

	private async run(authorization?: string) {
		this.authorize(authorization);

		return this.sync.runDue();
	}

	private authorize(authorization?: string): void {
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to run the sync route.",
			});
			throw new ServiceUnavailableException("Sync is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
