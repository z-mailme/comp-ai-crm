import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AdsClient } from "./ads.client";
import { MarketingAttributionService } from "./attribution.service";
import { MarketingAudiencesRouter } from "./audiences.router";
import { MarketingAudiencesService } from "./audiences.service";
import { MarketingAutomationRouter } from "./automation.router";
import { MarketingAutomationService } from "./automation.service";
import { MarketingCampaignsRouter } from "./campaigns.router";
import { MarketingCampaignsService } from "./campaigns.service";
import { MarketingContentRouter } from "./content.router";
import { MarketingContentService } from "./content.service";
import { MarketingEmailRouter } from "./email.router";
import { MarketingEmailService } from "./email.service";
import { ListmonkClient } from "./listmonk.client";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";
import { MarketingSyncController } from "./marketing-sync.controller";
import { MarketingMediaController } from "./media.controller";
import { MarketingMediaRouter } from "./media.router";
import { MarketingMediaService } from "./media.service";
import { MarketingSocialRouter } from "./social.router";
import { MarketingSocialService } from "./social.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [MarketingMediaController, MarketingSyncController],
	providers: [
		MarketingService,
		MarketingRouter,
		MarketingAutomationService,
		MarketingAutomationRouter,
		MarketingCampaignsService,
		MarketingCampaignsRouter,
		MarketingContentService,
		MarketingContentRouter,
		MarketingEmailService,
		MarketingEmailRouter,
		MarketingMediaService,
		MarketingMediaRouter,
		MarketingSocialService,
		MarketingSocialRouter,
		MarketingAudiencesService,
		MarketingAudiencesRouter,
		MarketingAttributionService,
		ListmonkClient,
		AdsClient,
	],
})
export class MarketingModule {}
