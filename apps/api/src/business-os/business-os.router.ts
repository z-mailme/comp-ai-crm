import { Inject } from "@nestjs/common";
import { Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	approvalsOutput,
	businessOsOverviewOutput,
	conversationDetailOutput,
	conversationInput,
	customer360Input,
	customer360Output,
	globalSearchInput,
	globalSearchOutput,
	inboxInput,
	inboxOutput,
	knowledgeOutput,
	observabilityOutput,
} from "./business-os.contracts";
import { BusinessOsService } from "./business-os.service";

@Router({ alias: "businessOs" })
@UseMiddlewares(AuthMiddleware)
export class BusinessOsRouter {
	constructor(
		@Inject(BusinessOsService) private readonly businessOs: BusinessOsService,
	) {}

	@Query({
		output: businessOsOverviewOutput,
		meta: restMeta("GET", "/business-os/overview", ["Business OS"]),
	})
	async overview() {
		return this.businessOs.overview();
	}

	@Query({
		input: inboxInput,
		output: inboxOutput,
		meta: restMeta("GET", "/business-os/inbox", ["Business OS"]),
	})
	async inbox(@Input() input: z.infer<typeof inboxInput>) {
		return this.businessOs.inbox(input);
	}

	@Query({
		input: conversationInput,
		output: conversationDetailOutput,
		meta: restMeta("GET", "/business-os/conversations/{id}", ["Business OS"]),
	})
	async conversation(@Input("id") id: string) {
		return this.businessOs.conversation(id);
	}

	@Query({
		input: customer360Input,
		output: customer360Output,
		meta: restMeta("GET", "/business-os/customer-360/{contactId}", [
			"Business OS",
		]),
	})
	async customer360(@Input("contactId") contactId: string) {
		return this.businessOs.customer360(contactId);
	}

	@Query({
		input: globalSearchInput,
		output: globalSearchOutput,
		meta: restMeta("GET", "/business-os/search", ["Business OS"]),
	})
	async globalSearch(@Input() input: z.infer<typeof globalSearchInput>) {
		return this.businessOs.globalSearch(input);
	}

	@Query({
		output: approvalsOutput,
		meta: restMeta("GET", "/business-os/approvals", ["Business OS"]),
	})
	async approvals() {
		return this.businessOs.approvals();
	}

	@Query({
		output: knowledgeOutput,
		meta: restMeta("GET", "/business-os/knowledge", ["Business OS"]),
	})
	async knowledge() {
		return this.businessOs.knowledge();
	}

	@Query({
		output: observabilityOutput,
		meta: restMeta("GET", "/business-os/observability", ["Business OS"]),
	})
	async observability() {
		return this.businessOs.observability();
	}
}
