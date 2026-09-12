import {
	BusinessEventSource,
	CommunicationChannel,
	type Db,
	MarketingIntegrationStatus,
	MarketingProvider,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import {
	type AudienceOutput,
	type AudienceRules,
	audienceRules,
	type CreateAudienceInput,
	type UpdateAudienceInput,
} from "./audiences.contracts";
import { ListmonkClient, type ListmonkConfig } from "./listmonk.client";
import { MARKETING_EMAIL } from "./marketing-config";

const listmonkConfig = z.object({
	baseUrl: z.string().url(),
	authMethod: z.enum(["basic", "token"]),
	username: z.string().optional(),
});

const listmonkSecrets = z.object({
	password: z.string().optional(),
	token: z.string().optional(),
});

@Injectable()
export class MarketingAudiencesService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly listmonk: ListmonkClient,
	) {}

	async list(source: BusinessContextSource) {
		const context = await resolveBusinessContext(this.db, source);
		const rows = await this.db.marketingAudience.findMany({
			where: { businessUnitId: context.businessUnitId },
			orderBy: { updatedAt: "desc" },
		});

		const audiences = await Promise.all(
			rows.map(async (row) => {
				const rules = audienceRules.parse(row.rules ?? {});
				const count = await this.db.contact.count({
					where: audienceContactWhere(rules),
				});
				return serializeAudience(row, rules, count);
			}),
		);

		const [allowed, blocked, unsubscribed, total] = await Promise.all([
			this.db.contact.count({
				where: {
					archivedAt: null,
					email: { not: null },
					emailMarketingAllowed: true,
					unsubscribeDate: null,
				},
			}),
			this.db.contact.count({
				where: { archivedAt: null, emailMarketingAllowed: false },
			}),
			this.db.contact.count({
				where: { archivedAt: null, unsubscribeDate: { not: null } },
			}),
			this.db.contact.count({ where: { archivedAt: null } }),
		]);

		return {
			audiences,
			consent: { allowed, blocked, unsubscribed, total },
		};
	}

	async count(source: BusinessContextSource, input: { rules: AudienceRules }) {
		await resolveBusinessContext(this.db, source);
		const rules = audienceRules.parse(input.rules);
		const count = await this.db.contact.count({
			where: audienceContactWhere(rules),
		});
		return { count };
	}

	async create(source: BusinessContextSource, input: CreateAudienceInput) {
		const context = await resolveBusinessContext(this.db, source);
		const rules = audienceRules.parse(input.rules);
		const row = await this.db.marketingAudience.create({
			data: {
				businessUnitId: context.businessUnitId,
				name: input.name,
				description: input.description ?? null,
				source: "crm",
				status: "active",
				rules: toJson(rules),
				createdById: source.userId,
			},
		});
		await this.event(context.businessUnitId, "marketing.audience.created", {
			audienceId: row.id,
			name: row.name,
		});
		const count = await this.db.contact.count({
			where: audienceContactWhere(rules),
		});
		return serializeAudience(row, rules, count);
	}

	async update(source: BusinessContextSource, input: UpdateAudienceInput) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingAudience.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!existing) throw new NotFoundException("Audience not found.");
		if (existing.status === "archived") {
			throw new BadRequestException("Archived audiences cannot be edited.");
		}

		const rules =
			input.rules !== undefined ? audienceRules.parse(input.rules) : undefined;
		const row = await this.db.marketingAudience.update({
			where: { id: existing.id },
			data: {
				name: input.name,
				description: input.description,
				rules: rules !== undefined ? toJson(rules) : undefined,
			},
		});
		await this.event(context.businessUnitId, "marketing.audience.updated", {
			audienceId: row.id,
		});
		const finalRules = audienceRules.parse(row.rules ?? {});
		const count = await this.db.contact.count({
			where: audienceContactWhere(finalRules),
		});
		return serializeAudience(row, finalRules, count);
	}

	async archive(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingAudience.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!existing) throw new NotFoundException("Audience not found.");

		const row = await this.db.marketingAudience.update({
			where: { id: existing.id },
			data: { status: "archived" },
		});
		await this.event(context.businessUnitId, "marketing.audience.archived", {
			audienceId: row.id,
		});
		const rules = audienceRules.parse(row.rules ?? {});
		return serializeAudience(row, rules, 0);
	}

	async exportToList(source: BusinessContextSource, input: { id: string }) {
		const context = await resolveBusinessContext(this.db, source);
		const audience = await this.db.marketingAudience.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!audience) throw new NotFoundException("Audience not found.");
		if (audience.status === "archived") {
			throw new BadRequestException("Archived audiences cannot be exported.");
		}

		const credentials = await this.credentials(context.businessUnitId);
		const rules = audienceRules.parse(audience.rules ?? {});

		let listId = audience.providerListId
			? Number(audience.providerListId)
			: null;
		if (listId === null || !Number.isInteger(listId)) {
			const created = await this.listmonk.createList(credentials, {
				name: audience.name,
				description: audience.description ?? undefined,
			});
			listId = created.data.id;
			await this.db.marketingAudience.update({
				where: { id: audience.id },
				data: {
					provider: MarketingProvider.LISTMONK,
					providerListId: String(listId),
				},
			});
		}

		const contacts = await this.db.contact.findMany({
			where: {
				...audienceContactWhere(rules),
				email: { not: null },
				emailMarketingAllowed: true,
				unsubscribeDate: null,
			},
			select: { email: true, firstName: true, lastName: true },
			take: MARKETING_EMAIL.syncContactLimit,
		});

		const existing = await this.listmonk.subscribers(credentials, {
			listId,
			page: 1,
			perPage: "all",
		});
		const present = new Set(
			existing.subscribers.map((row) => row.email.toLowerCase()),
		);

		let synced = 0;
		let existingCount = 0;
		let failed = 0;
		for (const contact of contacts) {
			if (!contact.email) continue;
			const email = contact.email.toLowerCase();
			if (present.has(email)) {
				existingCount += 1;
				continue;
			}
			try {
				await this.listmonk.createSubscriber(credentials, {
					email: contact.email,
					name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
					listIds: [listId],
				});
				present.add(email);
				synced += 1;
			} catch {
				failed += 1;
			}
		}

		await this.event(context.businessUnitId, "marketing.audience.exported", {
			audienceId: audience.id,
			listId,
			synced,
			existing: existingCount,
			failed,
		});
		return { listId, synced, existing: existingCount, failed };
	}

	private async credentials(businessUnitId: string): Promise<ListmonkConfig> {
		const integration = await this.db.marketingIntegration.findUnique({
			where: {
				businessUnitId_provider: {
					businessUnitId,
					provider: MarketingProvider.LISTMONK,
				},
			},
			select: { status: true, config: true, secrets: true },
		});
		if (
			!integration ||
			integration.status === MarketingIntegrationStatus.NOT_CONFIGURED
		) {
			throw new BadRequestException(
				"Listmonk is not connected. Connect it before exporting an audience.",
			);
		}
		return {
			...listmonkConfig.parse(integration.config ?? {}),
			...listmonkSecrets.parse(integration.secrets ?? {}),
		};
	}

	private async event(
		businessUnitId: string,
		type: string,
		data: Prisma.InputJsonObject,
	) {
		await this.db.businessEvent.create({
			data: {
				businessUnitId,
				type,
				source: BusinessEventSource.SYSTEM,
				channel: CommunicationChannel.INTERNAL,
				occurredAt: new Date(),
				data,
				idempotencyKey: `marketing:audience:${type}:${crypto.randomUUID()}`,
			},
		});
	}
}

export function audienceContactWhere(
	rules: AudienceRules,
): Prisma.ContactWhereInput {
	const where: Prisma.ContactWhereInput = { archivedAt: null };
	const and: Prisma.ContactWhereInput[] = [];

	if (rules.consent === "allowed") {
		and.push({ emailMarketingAllowed: true, unsubscribeDate: null });
	} else if (rules.consent === "blocked") {
		and.push({
			OR: [
				{ emailMarketingAllowed: false },
				{ unsubscribeDate: { not: null } },
			],
		});
	}

	if (rules.sources?.length) {
		and.push({ source: { in: rules.sources } });
	}

	if (rules.utmSources?.length) {
		and.push({
			visitors: {
				some: {
					OR: [
						{ firstSource: { in: rules.utmSources } },
						{ lastSource: { in: rules.utmSources } },
					],
				},
			},
		});
	}

	if (rules.utmCampaigns?.length) {
		and.push({
			visitors: {
				some: {
					OR: [
						{ firstCampaign: { in: rules.utmCampaigns } },
						{ lastCampaign: { in: rules.utmCampaigns } },
					],
				},
			},
		});
	}

	if (rules.companyCities?.length) {
		and.push({
			company: {
				OR: rules.companyCities.map((city) => ({
					city: { equals: city, mode: "insensitive" },
				})),
			},
		});
	}

	if (rules.companyCountries?.length) {
		and.push({
			company: {
				countryCode: {
					in: rules.companyCountries.map((code) => code.toUpperCase()),
				},
			},
		});
	}

	if (rules.dealStages?.length) {
		and.push({
			deals: {
				some: { deal: { stage: { in: rules.dealStages }, archivedAt: null } },
			},
		});
	}

	if (rules.bookingStatuses?.length) {
		and.push({
			deals: {
				some: {
					deal: {
						bookings: { some: { status: { in: rules.bookingStatuses } } },
					},
				},
			},
		});
	}

	if (rules.resourceTypes?.length) {
		and.push({
			deals: {
				some: {
					deal: {
						bookings: {
							some: {
								resources: {
									some: { resourceType: { in: rules.resourceTypes } },
								},
							},
						},
					},
				},
			},
		});
	}

	if (rules.createdAfter && rules.createdBefore) {
		and.push({
			createdAt: {
				gte: new Date(rules.createdAfter),
				lte: new Date(rules.createdBefore),
			},
		});
	} else if (rules.createdAfter) {
		and.push({ createdAt: { gte: new Date(rules.createdAfter) } });
	} else if (rules.createdBefore) {
		and.push({ createdAt: { lte: new Date(rules.createdBefore) } });
	}

	if (rules.lastActivityBefore) {
		and.push({
			OR: [
				{ lastActivityAt: null },
				{ lastActivityAt: { lt: new Date(rules.lastActivityBefore) } },
			],
		});
	}

	if (rules.minDealAmount !== undefined) {
		and.push({
			deals: {
				some: { deal: { amount: { gte: rules.minDealAmount } } },
			},
		});
	}

	if (rules.hasBooking === true) {
		and.push({ deals: { some: { deal: { bookings: { some: {} } } } } });
	} else if (rules.hasBooking === false) {
		and.push({ deals: { none: { deal: { bookings: { some: {} } } } } });
	}

	if (and.length > 0) where.AND = and;
	return where;
}

function serializeAudience(
	row: {
		id: string;
		name: string;
		description: string | null;
		status: string;
		provider: MarketingProvider | null;
		providerListId: string | null;
		createdAt: Date;
		updatedAt: Date;
	},
	rules: AudienceRules,
	count: number,
): AudienceOutput {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		status: row.status,
		rules,
		count,
		provider: row.provider,
		providerListId: row.providerListId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toJson(value: AudienceRules): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
