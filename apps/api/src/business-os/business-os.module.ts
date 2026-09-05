import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { BusinessOsRouter } from "./business-os.router";
import { BusinessOsService } from "./business-os.service";

@Module({
	imports: [TrpcModule],
	providers: [BusinessOsService, BusinessOsRouter],
})
export class BusinessOsModule {}
