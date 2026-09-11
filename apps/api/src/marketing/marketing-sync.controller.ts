import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
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
import { MarketingService } from "./marketing.service";

@ApiTags("Internal — Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/sync")
export class MarketingSyncController {
	private readonly logger = new Logger(MarketingSyncController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly marketing: MarketingService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("marketing-ads")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Refresh cached Google Ads and Meta Ads report snapshots",
	})
	@ApiOkResponse({ description: "Snapshots refreshed; per-provider results." })
	async marketingAdsViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("marketing-ads")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async marketingAdsViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message:
					"CRON_SECRET is not set — refusing to run the marketing sync route.",
			});
			throw new ServiceUnavailableException(
				"Marketing ads sync is not configured.",
			);
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		const results = await this.marketing.syncAllAds();
		return { synced: results.filter((row) => row.synced).length, results };
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
