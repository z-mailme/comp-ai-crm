import { afterAll, describe, expect, it } from "bun:test";
import { db, type BusinessKnowledgeModel } from "@crm/db";
import {
	currentKnowledge,
	recordKnowledge,
	resolveCurrent,
	supersedeKnowledge,
} from "@crm/db/knowledge";

const suffix = process.env.TEST_RUN_ID ?? "knowledge-spec";

function fixture(
	partial: Partial<BusinessKnowledgeModel>,
): BusinessKnowledgeModel {
	return {
		id: `fixture-${suffix}`,
		businessUnitId: null,
		kind: "FACT",
		subject: "fixture",
		detail: null,
		data: null,
		sourceType: "CRM",
		sourceId: null,
		sourceAt: null,
		extractedAt: new Date(),
		confidence: 0.5,
		aiGenerated: true,
		humanConfirmed: false,
		confirmedById: null,
		confirmedAt: null,
		validFrom: new Date("2025-01-01T00:00:00Z"),
		validUntil: null,
		supersededById: null,
		companyId: null,
		contactId: null,
		dealId: null,
		bookingId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...partial,
	};
}

async function clean(): Promise<void> {
	await db.businessKnowledge.deleteMany({
		where: { sourceId: { contains: suffix } },
	});
	await db.company.deleteMany({ where: { name: { contains: suffix } } });
}

afterAll(clean);

describe("Business Brain knowledge", () => {
	it("records a fact with full provenance", async () => {
		const fact = await recordKnowledge(db, {
			kind: "PRICING",
			subject: "Draping costs R180 per metre",
			sourceType: "GMAIL",
			sourceId: `msg-${suffix}-1`,
			sourceAt: new Date("2026-01-10T10:00:00Z"),
			confidence: 0.8,
			aiGenerated: true,
		});

		expect(fact.id).toBeTruthy();
		expect(fact.sourceType).toBe("GMAIL");
		expect(fact.confidence).toBe(0.8);
		expect(fact.humanConfirmed).toBe(false);
	});

	it("supersedes an old rule so only the new one resolves", async () => {
		const old = await recordKnowledge(db, {
			kind: "PRICING",
			subject: "Draping costs R150 per metre",
			sourceType: "GMAIL",
			sourceId: `msg-${suffix}-2`,
			sourceAt: new Date("2025-06-01T10:00:00Z"),
			validFrom: new Date("2025-06-01T10:00:00Z"),
			confidence: 0.9,
		});

		const next = await supersedeKnowledge(db, old.id, {
			kind: "PRICING",
			subject: "Draping costs R180 per metre",
			sourceType: "GMAIL",
			sourceId: `msg-${suffix}-3`,
			sourceAt: new Date("2026-02-01T10:00:00Z"),
			validFrom: new Date("2026-02-01T10:00:00Z"),
			confidence: 0.9,
		});

		const current = await currentKnowledge(db, { kind: "PRICING" });
		const subjects = current.map((item) => item.subject);

		expect(subjects).toContain("Draping costs R180 per metre");
		expect(subjects).not.toContain("Draping costs R150 per metre");

		const stale = await db.businessKnowledge.findUnique({
			where: { id: old.id },
		});
		expect(stale?.supersededById).toBe(next.id);
	});

	it("prefers a human-confirmed older rule over a newer unconfirmed one", () => {
		const confirmed = fixture({
			id: "a",
			humanConfirmed: true,
			confirmedAt: new Date("2025-01-01T00:00:00Z"),
		});
		const fresh = fixture({
			id: "b",
			sourceAt: new Date("2026-06-01T00:00:00Z"),
			validFrom: new Date("2026-06-01T00:00:00Z"),
		});

		const [first] = resolveCurrent([fresh, confirmed]);
		expect(first?.id).toBe("a");
	});

	it("drops expired and not-yet-valid knowledge", () => {
		const future = fixture({
			validFrom: new Date(Date.now() + 86_400_000),
		});
		const expired = fixture({
			validFrom: new Date("2020-01-01T00:00:00Z"),
			validUntil: new Date("2020-06-01T00:00:00Z"),
		});

		expect(resolveCurrent([future, expired])).toHaveLength(0);
	});

	it("scopes retrieval to an entity link", async () => {
		const company = await db.company.create({
			data: { name: `Brain Co ${suffix}`, updatedAt: new Date() },
		});

		await recordKnowledge(db, {
			kind: "COMPANY_CONTEXT",
			subject: "Brain Co prefers morning setups",
			sourceType: "CRM",
			sourceId: `crm-${suffix}-1`,
			companyId: company.id,
			confidence: 0.7,
		});
		await recordKnowledge(db, {
			kind: "COMPANY_CONTEXT",
			subject: "Unlinked observation",
			sourceType: "CRM",
			sourceId: `crm-${suffix}-2`,
			confidence: 0.7,
		});

		const scoped = await currentKnowledge(db, { companyId: company.id });
		expect(scoped.map((item) => item.subject)).toEqual([
			"Brain Co prefers morning setups",
		]);
	});
});
