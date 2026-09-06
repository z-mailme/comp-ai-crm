import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AdsClient } from "./ads.client";
import { ListmonkClient } from "./listmonk.client";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";

@Module({
	imports: [TrpcModule],
	providers: [MarketingService, MarketingRouter, ListmonkClient, AdsClient],
})
export class MarketingModule {}
