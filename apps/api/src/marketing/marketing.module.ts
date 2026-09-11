import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AdsClient } from "./ads.client";
import { MarketingAttributionService } from "./attribution.service";
import { MarketingCampaignsRouter } from "./campaigns.router";
import { MarketingCampaignsService } from "./campaigns.service";
import { MarketingContentRouter } from "./content.router";
import { MarketingContentService } from "./content.service";
import { ListmonkClient } from "./listmonk.client";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";
import { MarketingMediaController } from "./media.controller";
import { MarketingMediaRouter } from "./media.router";
import { MarketingMediaService } from "./media.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [MarketingMediaController],
	providers: [
		MarketingService,
		MarketingRouter,
		MarketingCampaignsService,
		MarketingCampaignsRouter,
		MarketingContentService,
		MarketingContentRouter,
		MarketingMediaService,
		MarketingMediaRouter,
		MarketingAttributionService,
		ListmonkClient,
		AdsClient,
	],
})
export class MarketingModule {}
