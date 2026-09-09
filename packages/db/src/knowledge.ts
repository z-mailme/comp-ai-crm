import type { Db } from "./client";
import type {
	BusinessEventSource,
	BusinessKnowledge,
	KnowledgeKind,
	Prisma,
} from "./generated/prisma/client";

export type KnowledgeInput = {
	kind: KnowledgeKind;
	subject: string;
	detail?: string | null;
	data?: Prisma.InputJsonValue;
	sourceType: BusinessEventSource;
	sourceId?: string | null;
	sourceAt?: Date | null;
	confidence?: number;
	aiGenerated?: boolean;
	humanConfirmed?: boolean;
	confirmedById?: string | null;
	validFrom?: Date;
	validUntil?: Date | null;
	businessUnitId?: string | null;
	companyId?: string | null;
	contactId?: string | null;
	dealId?: string | null;
	bookingId?: string | null;
};

export type KnowledgeQuery = {
	kind?: KnowledgeKind;
	companyId?: string;
	contactId?: string;
	dealId?: string;
	bookingId?: string;
	businessUnitId?: string;
	limit?: number;
};

export async function recordKnowledge(
	db: Db,
	input: KnowledgeInput,
): Promise<BusinessKnowledge> {
	return db.businessKnowledge.create({
		data: {
			kind: input.kind,
			subject: input.subject,
			detail: input.detail ?? null,
			data: input.data,
			sourceType: input.sourceType,
			sourceId: input.sourceId ?? null,
			sourceAt: input.sourceAt ?? null,
			confidence: input.confidence ?? 0.5,
			aiGenerated: input.aiGenerated ?? true,
			humanConfirmed: input.humanConfirmed ?? false,
			confirmedById: input.confirmedById ?? null,
			confirmedAt: input.humanConfirmed ? new Date() : null,
			validFrom: input.validFrom ?? new Date(),
			validUntil: input.validUntil ?? null,
			businessUnitId: input.businessUnitId ?? null,
			companyId: input.companyId ?? null,
			contactId: input.contactId ?? null,
			dealId: input.dealId ?? null,
			bookingId: input.bookingId ?? null,
		},
	});
}

export async function supersedeKnowledge(
	db: Db,
	supersededId: string,
	input: KnowledgeInput,
): Promise<BusinessKnowledge> {
	return db.$transaction(async (tx) => {
		const next = await tx.businessKnowledge.create({
			data: {
				kind: input.kind,
				subject: input.subject,
				detail: input.detail ?? null,
				data: input.data,
				sourceType: input.sourceType,
				sourceId: input.sourceId ?? null,
				sourceAt: input.sourceAt ?? null,
				confidence: input.confidence ?? 0.5,
				aiGenerated: input.aiGenerated ?? true,
				humanConfirmed: input.humanConfirmed ?? false,
				confirmedById: input.confirmedById ?? null,
				confirmedAt: input.humanConfirmed ? new Date() : null,
				validFrom: input.validFrom ?? new Date(),
				validUntil: input.validUntil ?? null,
				businessUnitId: input.businessUnitId ?? null,
				companyId: input.companyId ?? null,
				contactId: input.contactId ?? null,
				dealId: input.dealId ?? null,
				bookingId: input.bookingId ?? null,
			},
		});

		await tx.businessKnowledge.update({
			where: { id: supersededId },
			data: { supersededById: next.id },
		});

		return next;
	});
}

export async function currentKnowledge(
	db: Db,
	query: KnowledgeQuery,
): Promise<BusinessKnowledge[]> {
	const rows = await db.businessKnowledge.findMany({
		where: {
			kind: query.kind,
			companyId: query.companyId,
			contactId: query.contactId,
			dealId: query.dealId,
			bookingId: query.bookingId,
			businessUnitId: query.businessUnitId,
		},
		take: query.limit ?? 100,
	});

	return resolveCurrent(rows);
}

export function resolveCurrent<T extends BusinessKnowledge>(
	items: readonly T[],
	now: Date = new Date(),
): T[] {
	const live = items.filter(
		(item) =>
			item.supersededById === null &&
			item.validFrom <= now &&
			(item.validUntil === null || item.validUntil > now),
	);

	return live.sort((a, b) => rank(b) - rank(a));
}

function rank(item: BusinessKnowledge): number {
	const confirmed = item.humanConfirmed ? 1 : 0;
	const stamp = (item.confirmedAt ?? item.sourceAt ?? item.validFrom).getTime();

	return confirmed * 1e15 + stamp;
}
