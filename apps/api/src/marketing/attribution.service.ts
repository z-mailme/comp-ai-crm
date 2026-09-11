import { type Db, DealStage, type Prisma } from "@crm/db";
import { readReportingCurrency } from "@crm/db/settings";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type AttributionRange = {
	from?: Date;
	to?: Date;
};

export type CampaignPerformance = {
	leads: number;
	firstTouchLeads: number;
	lastTouchLeads: number;
	bookings: number;
	expectedRevenueCents: number | null;
	closedRevenueCents: number | null;
	unconvertedDeals: number;
	measured: boolean;
	currency: string;
};

export type SourceBreakdownRow = {
	source: string;
	medium: string;
	leads: number;
	bookings: number;
	closedRevenueCents: number | null;
};

export function normalizeCampaignKey(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim().toLowerCase();
	return trimmed ? trimmed : null;
}

@Injectable()
export class MarketingAttributionService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async performanceForUtmCampaign(
		utmCampaign: string | null,
		range: AttributionRange = {},
	): Promise<CampaignPerformance> {
		const base = await readReportingCurrency(this.db);
		const key = normalizeCampaignKey(utmCampaign);
		if (!key) {
			return {
				leads: 0,
				firstTouchLeads: 0,
				lastTouchLeads: 0,
				bookings: 0,
				expectedRevenueCents: null,
				closedRevenueCents: null,
				unconvertedDeals: 0,
				measured: false,
				currency: base,
			};
		}

		const visitors = await this.db.trackedVisitor.findMany({
			where: {
				contactId: { not: null },
				OR: [
					{ firstCampaign: { equals: key, mode: "insensitive" } },
					{ lastCampaign: { equals: key, mode: "insensitive" } },
				],
			},
			select: {
				contactId: true,
				firstCampaign: true,
				lastCampaign: true,
			},
		});

		const contactIds = new Set<string>();
		let firstTouchLeads = 0;
		let lastTouchLeads = 0;
		for (const visitor of visitors) {
			if (!visitor.contactId) continue;
			contactIds.add(visitor.contactId);
			if (normalizeCampaignKey(visitor.firstCampaign) === key)
				firstTouchLeads += 1;
			if (normalizeCampaignKey(visitor.lastCampaign) === key)
				lastTouchLeads += 1;
		}

		if (contactIds.size === 0) {
			return {
				leads: 0,
				firstTouchLeads: 0,
				lastTouchLeads: 0,
				bookings: 0,
				expectedRevenueCents: null,
				closedRevenueCents: null,
				unconvertedDeals: 0,
				measured: true,
				currency: base,
			};
		}

		const contactWhere: Prisma.ContactWhereInput = {
			id: { in: [...contactIds] },
			archivedAt: null,
			createdAt: createdIn(range),
		};

		const leads = await this.db.contact.count({ where: contactWhere });

		const dealLinks = await this.db.dealContact.findMany({
			where: { contactId: { in: [...contactIds] } },
			select: { dealId: true },
		});
		const dealIds = [...new Set(dealLinks.map((link) => link.dealId))];

		const deals = dealIds.length
			? await this.db.deal.findMany({
					where: {
						id: { in: dealIds },
						archivedAt: null,
					},
					select: {
						id: true,
						stage: true,
						baseAmount: true,
						baseCurrency: true,
						createdAt: true,
						closedAt: true,
					},
				})
			: [];

		const expectedDeals = deals.filter(
			(deal) =>
				deal.stage !== DealStage.CLOSED_LOST && inRange(deal.createdAt, range),
		);
		const closedDeals = deals.filter(
			(deal) =>
				deal.stage === DealStage.CLOSED_WON &&
				inRange(deal.closedAt ?? deal.createdAt, range),
		);

		const bookings = dealIds.length
			? await this.db.booking.count({
					where: {
						dealId: { in: dealIds },
						createdAt: createdIn(range),
					},
				})
			: 0;

		const expected = sumCounted(expectedDeals, base);
		const closed = sumCounted(closedDeals, base);

		return {
			leads,
			firstTouchLeads,
			lastTouchLeads,
			bookings,
			expectedRevenueCents: expected.cents,
			closedRevenueCents: closed.cents,
			unconvertedDeals: expected.unconverted + closed.unconverted,
			measured: true,
			currency: base,
		};
	}

	async sourceBreakdown(range: AttributionRange = {}): Promise<{
		rows: SourceBreakdownRow[];
	}> {
		const visitors = await this.db.trackedVisitor.findMany({
			where: { contactId: { not: null } },
			select: {
				contactId: true,
				firstSource: true,
				firstMedium: true,
			},
		});

		const contactWhere: Prisma.ContactWhereInput = {
			id: { in: [...new Set(visitors.map((row) => row.contactId ?? ""))] },
			archivedAt: null,
			createdAt: createdIn(range),
		};
		const contacts = await this.db.contact.findMany({
			where: contactWhere,
			select: { id: true },
		});
		const leadIds = new Set(contacts.map((row) => row.id));

		const groups = new Map<
			string,
			SourceBreakdownRow & { contacts: Set<string> }
		>();
		for (const visitor of visitors) {
			if (!visitor.contactId || !leadIds.has(visitor.contactId)) continue;
			const source = visitor.firstSource ?? "Unknown";
			const medium = visitor.firstMedium ?? "other";
			const key = `${source}${medium}`;
			const group = groups.get(key) ?? {
				source,
				medium,
				leads: 0,
				bookings: 0,
				closedRevenueCents: null,
				contacts: new Set<string>(),
			};
			group.contacts.add(visitor.contactId);
			groups.set(key, group);
		}

		const base = await readReportingCurrency(this.db);

		const rows: SourceBreakdownRow[] = [];
		for (const group of groups.values()) {
			const contactIds = [...group.contacts];
			const dealLinks = await this.db.dealContact.findMany({
				where: { contactId: { in: contactIds } },
				select: { dealId: true },
			});
			const dealIds = [...new Set(dealLinks.map((link) => link.dealId))];

			const closedDeals = dealIds.length
				? await this.db.deal.findMany({
						where: {
							id: { in: dealIds },
							archivedAt: null,
							stage: DealStage.CLOSED_WON,
						},
						select: {
							baseAmount: true,
							baseCurrency: true,
							closedAt: true,
							createdAt: true,
						},
					})
				: [];

			const closed = sumCounted(
				closedDeals.filter((deal) =>
					inRange(deal.closedAt ?? deal.createdAt, range),
				),
				base,
			);

			const bookings = dealIds.length
				? await this.db.booking.count({
						where: {
							dealId: { in: dealIds },
							createdAt: createdIn(range),
						},
					})
				: 0;

			rows.push({
				source: group.source,
				medium: group.medium,
				leads: group.contacts.size,
				bookings,
				closedRevenueCents: closed.cents,
			});
		}

		rows.sort((a, b) => b.leads - a.leads);
		return { rows };
	}
}

function createdIn(range: AttributionRange) {
	if (!range.from && !range.to) return undefined;
	return { gte: range.from, lte: range.to };
}

function inRange(date: Date, range: AttributionRange): boolean {
	if (range.from && date < range.from) return false;
	if (range.to && date > range.to) return false;
	return true;
}

function sumCounted(
	deals: {
		baseAmount: Prisma.Decimal | null;
		baseCurrency: string | null;
	}[],
	base: string,
) {
	let total = 0;
	let seen = false;
	let unconverted = 0;

	for (const deal of deals) {
		if (deal.baseAmount === null || deal.baseCurrency !== base) {
			unconverted += 1;
			continue;
		}
		total += Number(deal.baseAmount) * 100;
		seen = true;
	}

	return { cents: seen ? Math.round(total) : null, unconverted };
}
