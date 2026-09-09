import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BrainRouter } from "./brain.router";
import { BrainService } from "./brain.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [BrainService, BrainRouter],
})
export class BrainModule {}
