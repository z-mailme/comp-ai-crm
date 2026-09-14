import { Module } from "@nestjs/common";
import { CurrencyModule } from "../currency/currency.module";
import { TrpcModule } from "../trpc/trpc.module";
import { FinanceRouter } from "./finance.router";
import { FinanceService } from "./finance.service";
import { FinanceDocumentsController } from "./finance-documents.controller";

@Module({
	imports: [TrpcModule, CurrencyModule],
	controllers: [FinanceDocumentsController],
	providers: [FinanceService, FinanceRouter],
	exports: [FinanceService],
})
export class FinanceModule {}
