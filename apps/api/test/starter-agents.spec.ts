import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { parseAgentManifest } from "@crm/validation/agent-manifest";
import { seedStarterAgents, STARTER_AGENTS } from "../src/agent/starter-agents";

const suffix = process.env.TEST_RUN_ID ?? "starter-agents-spec";

async function clean(): Promise<void> {
	const names = [...STARTER_AGENTS.map((agent) => agent.name)];
	await db.agentDefinition.updateMany({
		where: { name: { in: names } },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({
		where: { agent: { name: { in: names } } },
	});
	await db.agentDefinition.deleteMany({
		where: { name: { in: names } },
	});
	await db.user.deleteMany({ where: { id: { contains: suffix } } });
}

afterAll(clean);

describe("seedStarterAgents", () => {
	it("creates five draft agents with valid manifests and autonomy levels", async () => {
		const user = await db.user.create({
			data: {
				id: `user-${suffix}`,
				name: "Owner",
				email: `owner-${suffix}@example.test`,
			},
		});

		const first = await seedStarterAgents(db, user.id);
		expect(first.created).toBe(5);
		expect(first.skipped).toBe(0);

		const again = await seedStarterAgents(db, user.id);
		expect(again.created).toBe(0);
		expect(again.skipped).toBe(5);

		const versions = await db.agentVersion.findMany({
			where: {
				agent: { name: { in: [...STARTER_AGENTS.map((a) => a.name)] } },
			},
			select: {
				autonomyLevel: true,
				status: true,
				manifest: true,
				agent: { select: { name: true, status: true } },
			},
		});

		expect(versions).toHaveLength(5);

		for (const version of versions) {
			expect(version.status).toBe("DRAFT");
			expect(version.agent.status).toBe("DRAFT");
			expect(version.autonomyLevel).toBeLessThanOrEqual(2);
			expect(() => parseAgentManifest(version.manifest)).not.toThrow();
		}

		const byName = new Map(
			versions.map((version) => [version.agent.name, version.autonomyLevel]),
		);
		expect(byName.get("Inbox Triage")).toBe(2);
		expect(byName.get("Reply Drafter")).toBe(1);
		expect(byName.get("Payment Proof Watch")).toBe(1);
		expect(byName.get("Follow-up")).toBe(2);
		expect(byName.get("Operations Brief")).toBe(0);
	});
});
