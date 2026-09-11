import { type Db, MarketingCampaignStatus, type Prisma } from "@crm/db";
import { isCurrencyCode } from "@crm/db/currency";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	type BusinessContextSource,
	resolveBusinessContext,
} from "../business-os/business-context";
import { InjectDatabase } from "../database/database.constants";
import { MarketingAttributionService } from "./attribution.service";
import type {
	CampaignOutput,
	CreateCampaignInput,
	ListCampaignsInput,
	UpdateCampaignInput,
} from "./campaigns.contracts";
import { marketingChannel } from "./campaigns.contracts";

@Injectable()
export class MarketingCampaignsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly attribution: MarketingAttributionService,
	) {}

	async list(source: BusinessContextSource, input: ListCampaignsInput) {
		const context = await resolveBusinessContext(this.db, source);
		const where: Prisma.MarketingCampaignWhereInput = {
			businessUnitId: context.businessUnitId,
			status: input.status ?? { not: MarketingCampaignStatus.ARCHIVED },
		};
		if (input.query) {
			where.name = { contains: input.query, mode: "insensitive" };
		}
		const rows = await this.db.marketingCampaign.findMany({
			where,
			orderBy: [{ updatedAt: "desc" }],
			take: 200,
		});

		return { rows: rows.map(serialize) };
	}

	async byId(
		source: BusinessContextSource,
		input: { businessUnitId?: string; id: string },
	) {
		const context = await resolveBusinessContext(this.db, source);
		const campaign = await this.db.marketingCampaign.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
		});
		if (!campaign) throw new NotFoundException("Campaign not found.");
		return serialize(campaign);
	}

	async detail(
		source: BusinessContextSource,
		input: {
			businessUnitId?: string;
			id: string;
			range?: { from?: string; to?: string };
		},
	) {
		const campaign = await this.byId(source, input);
		const performance = await this.attribution.performanceForUtmCampaign(
			campaign.utmCampaign,
			{
				from: input.range?.from ? new Date(input.range.from) : undefined,
				to: input.range?.to ? new Date(input.range.to) : undefined,
			},
		);
		return { campaign, performance };
	}

	async create(source: BusinessContextSource, input: CreateCampaignInput) {
		const context = await resolveBusinessContext(this.db, source);
		const currency = normalizeCampaignCurrency(input.currency);
		const row = await this.db.marketingCampaign.create({
			data: {
				businessUnitId: context.businessUnitId,
				name: input.name,
				objective: input.objective ?? null,
				status: input.status ?? MarketingCampaignStatus.DRAFT,
				startDate: input.startDate ? new Date(input.startDate) : null,
				endDate: input.endDate ? new Date(input.endDate) : null,
				budget: input.budget ?? null,
				currency,
				targetAudience: input.targetAudience ?? null,
				channels: input.channels ?? [],
				notes: input.notes ?? null,
				utmSource: input.utmSource ?? null,
				utmMedium: input.utmMedium ?? null,
				utmCampaign: input.utmCampaign ?? null,
				utmContent: input.utmContent ?? null,
				utmTerm: input.utmTerm ?? null,
				ownerId: source.userId,
				createdById: source.userId,
			},
		});

		return serialize(row);
	}

	async update(source: BusinessContextSource, input: UpdateCampaignInput) {
		const context = await resolveBusinessContext(this.db, source);
		const existing = await this.db.marketingCampaign.findFirst({
			where: { id: input.id, businessUnitId: context.businessUnitId },
			select: { id: true },
		});
		if (!existing) throw new NotFoundException("Campaign not found.");

		const data: Prisma.MarketingCampaignUpdateInput = {};
		if (input.name !== undefined) data.name = input.name;
		if (input.objective !== undefined) data.objective = input.objective;
		if (input.status !== undefined) data.status = input.status;
		if (input.startDate !== undefined)
			data.startDate = input.startDate ? new Date(input.startDate) : null;
		if (input.endDate !== undefined)
			data.endDate = input.endDate ? new Date(input.endDate) : null;
		if (input.budget !== undefined) data.budget = input.budget;
		if (input.currency !== undefined)
			data.currency = normalizeCampaignCurrency(input.currency);
		if (input.targetAudience !== undefined)
			data.targetAudience = input.targetAudience;
		if (input.channels !== undefined) data.channels = input.channels;
		if (input.notes !== undefined) data.notes = input.notes;
		if (input.utmSource !== undefined) data.utmSource = input.utmSource;
		if (input.utmMedium !== undefined) data.utmMedium = input.utmMedium;
		if (input.utmCampaign !== undefined) data.utmCampaign = input.utmCampaign;
		if (input.utmContent !== undefined) data.utmContent = input.utmContent;
		if (input.utmTerm !== undefined) data.utmTerm = input.utmTerm;

		const row = await this.db.marketingCampaign.update({
			where: { id: existing.id },
			data,
		});

		return serialize(row);
	}

	async archive(source: BusinessContextSource, input: { id: string }) {
		return this.update(source, {
			id: input.id,
			status: MarketingCampaignStatus.ARCHIVED,
		});
	}

	async sourceBreakdown(
		source: BusinessContextSource,
		input: { businessUnitId?: string; from?: string; to?: string },
	) {
		await resolveBusinessContext(this.db, source);
		return this.attribution.sourceBreakdown({
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	}
}

function normalizeCampaignCurrency(value: string | undefined): string {
	if (value === undefined) return "USD";
	const code = value.trim().toUpperCase();
	if (!isCurrencyCode(code)) {
		throw new BadRequestException(`Unsupported currency: ${code}.`);
	}
	return code;
}

type CampaignRow = Prisma.MarketingCampaignGetPayload<object>;

function serialize(campaign: CampaignRow): CampaignOutput {
	return {
		id: campaign.id,
		name: campaign.name,
		objective: campaign.objective,
		status: campaign.status,
		startDate: campaign.startDate?.toISOString() ?? null,
		endDate: campaign.endDate?.toISOString() ?? null,
		budget: campaign.budget === null ? null : Number(campaign.budget),
		currency: campaign.currency,
		targetAudience: campaign.targetAudience,
		channels: parseChannels(campaign.channels),
		notes: campaign.notes,
		utmSource: campaign.utmSource,
		utmMedium: campaign.utmMedium,
		utmCampaign: campaign.utmCampaign,
		utmContent: campaign.utmContent,
		utmTerm: campaign.utmTerm,
		ownerId: campaign.ownerId,
		createdAt: campaign.createdAt.toISOString(),
		updatedAt: campaign.updatedAt.toISOString(),
	};
}

function parseChannels(value: Prisma.JsonValue) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const parsed = marketingChannel.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	});
}
