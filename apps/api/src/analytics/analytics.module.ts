import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { GoogleAnalyticsClient } from "./analytics.client";
import { GoogleAnalyticsRouter } from "./analytics.router";
import { GoogleAnalyticsService } from "./analytics.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	providers: [
		GoogleAnalyticsClient,
		GoogleAnalyticsService,
		GoogleAnalyticsRouter,
	],
	exports: [GoogleAnalyticsService],
})
export class AnalyticsModule {}
