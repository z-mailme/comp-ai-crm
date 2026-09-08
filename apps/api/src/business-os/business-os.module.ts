import { Module } from "@nestjs/common";
import { CurrencyModule } from "../currency/currency.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BusinessOsRouter } from "./business-os.router";
import { BusinessOsService } from "./business-os.service";

@Module({
	imports: [TrpcModule, CurrencyModule],
	providers: [BusinessOsService, BusinessOsRouter],
})
export class BusinessOsModule {}
