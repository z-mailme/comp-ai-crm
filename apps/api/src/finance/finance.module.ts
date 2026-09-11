import { Module } from "@nestjs/common";
import { CurrencyModule } from "../currency/currency.module";
import { TrpcModule } from "../trpc/trpc.module";
import { FinanceRouter } from "./finance.router";
import { FinanceService } from "./finance.service";

@Module({
	imports: [TrpcModule, CurrencyModule],
	providers: [FinanceService, FinanceRouter],
	exports: [FinanceService],
})
export class FinanceModule {}
