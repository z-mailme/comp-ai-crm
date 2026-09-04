import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
	imports: [CrmModule],
	controllers: [BookingsController],
	providers: [BookingsService],
	exports: [BookingsService],
})
export class BookingsModule {}
