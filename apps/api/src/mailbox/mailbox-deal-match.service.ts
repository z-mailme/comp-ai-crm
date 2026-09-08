import { type Db, type DealStage } from "@crm/db";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MAILBOX_MATCH } from "./mailbox.constants";

type DealTarget = {
	companyId: string | null;
	contactId: string | null;
};

export type DealMatchRequest = DealTarget & {
	explicitDealId?: string | null;
	existingDealId?: string | null;
	firstMessageAt: Date;
	lastMessageAt: Date;
};

export type DealMatchResult = {
	dealId: string | null;
	companyId: string | null;
};

@Injectable()
export class MailboxDealMatchService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async resolve(request: DealMatchRequest): Promise<DealMatchResult> {
		const explicit = await this.validLinkedDeal(
			request.explicitDealId ?? null,
			request,
		);
		if (explicit) return explicit;

		const existing = await this.validLinkedDeal(
			request.existingDealId ?? null,
			request,
		);
		if (existing) return existing;

		if (request.contactId) {
			const contactDeal = await this.singleCandidate({
				contactId: request.contactId,
				companyId: request.companyId,
				firstMessageAt: request.firstMessageAt,
			});
			if (contactDeal) return contactDeal;
		}

		if (request.companyId) {
			const companyDeal = await this.singleCandidate({
				companyId: request.companyId,
				firstMessageAt: request.firstMessageAt,
			});
			if (companyDeal) return companyDeal;
		}

		return { dealId: null, companyId: null };
	}

	private async validLinkedDeal(
		dealId: string | null,
		target: DealTarget,
	): Promise<DealMatchResult | null> {
		if (!dealId) return null;

		const related = [
			target.companyId ? { companyId: target.companyId } : null,
			target.contactId
				? { contacts: { some: { contactId: target.contactId } } }
				: null,
		].filter((where) => where !== null);

		const deal = await this.db.deal.findFirst({
			where: {
				id: dealId,
				archivedAt: null,
				OR: related.length > 0 ? related : undefined,
			},
			select: { id: true, companyId: true },
		});

		return deal ? { dealId: deal.id, companyId: deal.companyId } : null;
	}

	private async singleCandidate(input: {
		contactId?: string;
		companyId: string | null;
		firstMessageAt: Date;
	}): Promise<DealMatchResult | null> {
		if (!input.companyId) return null;

		const createdAfter = new Date(
			input.firstMessageAt.getTime() - MAILBOX_MATCH.deal.createdBeforeThreadMs,
		);
		const createdBefore = new Date(
			input.firstMessageAt.getTime() + MAILBOX_MATCH.deal.createdAfterThreadMs,
		);
		const eventAfter = new Date(
			input.firstMessageAt.getTime() -
				MAILBOX_MATCH.deal.eventEndedBeforeThreadMs,
		);

		const deals = await this.db.deal.findMany({
			where: {
				companyId: input.companyId,
				archivedAt: null,
				stage: { in: [...OPEN_DEAL_STAGES] as DealStage[] },
				createdAt: { gte: createdAfter, lte: createdBefore },
				OR: [
					{ expectedCloseDate: null },
					{ expectedCloseDate: { gte: eventAfter } },
				],
				contacts: input.contactId
					? { some: { contactId: input.contactId } }
					: undefined,
			},
			orderBy: { createdAt: "desc" },
			take: 2,
			select: { id: true, companyId: true },
		});

		if (deals.length !== 1) return null;

		const deal = deals[0];
		if (!deal) return null;

		return { dealId: deal.id, companyId: deal.companyId };
	}
}
