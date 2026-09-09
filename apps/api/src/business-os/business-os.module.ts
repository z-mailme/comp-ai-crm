import { Module } from "@nestjs/common";
import { CurrencyModule } from "../currency/currency.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BriefService } from "./brief.service";
import { BusinessOsRouter } from "./business-os.router";
import { BusinessOsService } from "./business-os.service";

@Module({
	imports: [TrpcModule, CurrencyModule],
	providers: [BusinessOsService, BusinessOsRouter, BriefService],
})
export class BusinessOsModule {}
