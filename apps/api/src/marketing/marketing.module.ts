import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AdsClient } from "./ads.client";
import { MarketingAttributionService } from "./attribution.service";
import { MarketingCampaignsRouter } from "./campaigns.router";
import { MarketingCampaignsService } from "./campaigns.service";
import { ListmonkClient } from "./listmonk.client";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";

@Module({
	imports: [TrpcModule],
	providers: [
		MarketingService,
		MarketingRouter,
		MarketingCampaignsService,
		MarketingCampaignsRouter,
		MarketingAttributionService,
		ListmonkClient,
		AdsClient,
	],
})
export class MarketingModule {}
