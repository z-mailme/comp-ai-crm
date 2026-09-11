import { describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ConversionService } from "../src/currency/conversion.service";
import {
	dashboardLayout,
	saveDashboardLayoutInput,
} from "../src/dashboard/dashboard.contracts";
import { DashboardService } from "../src/dashboard/dashboard.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `layout-${suffix}`;
const userA = `layout-user-a-${marker}`;
const userB = `layout-user-b-${marker}`;

const service = new DashboardService(db, new ConversionService(db));

async function seedUsers() {
	for (const [id, name] of [
		[userA, "Layout A"],
		[userB, "Layout B"],
	] as const) {
		await db.user.upsert({
			where: { id },
			create: { id, name, email: `${id}@example.test` },
			update: {},
		});
	}
}

describe("dashboard layout", () => {
	it("returns null layout for a user who never customized", async () => {
		await seedUsers();

		const result = await service.layout(userA);

		expect(result.dashboard).toBe("overview");
		expect(result.layout).toBeNull();
	});

	it("saves and reads back a custom layout", async () => {
		await seedUsers();
		const layout = [
			{ id: "week-finance", size: "full" },
			{ id: "inbox-unread", size: "half" },
			{ id: "upcoming-events", size: "half" },
		] as const;

		const saved = await service.saveLayout(userA, [...layout]);
		expect(saved.layout).toEqual([...layout]);

		const read = await service.layout(userA);
		expect(read.layout).toEqual([...layout]);
	});

	it("keeps layouts isolated per user", async () => {
		await seedUsers();
		await service.saveLayout(userA, [{ id: "week-finance", size: "full" }]);
		await service.saveLayout(userB, [{ id: "recent-activity", size: "full" }]);

		const a = await service.layout(userA);
		const b = await service.layout(userB);

		expect(a.layout?.[0]?.id).toBe("week-finance");
		expect(b.layout?.[0]?.id).toBe("recent-activity");
	});

	it("restores the default by clearing the saved layout", async () => {
		await seedUsers();
		await service.saveLayout(userA, [{ id: "week-finance", size: "full" }]);
		await service.saveLayout(userA, null);

		const read = await service.layout(userA);
		expect(read.layout).toBeNull();

		const stored = await db.userDashboardLayout.findMany({
			where: { userId: userA },
		});
		expect(stored).toHaveLength(0);
	});

	it("rejects unknown widget ids at the input boundary", () => {
		const parsed = saveDashboardLayoutInput.safeParse({
			layout: [{ id: "fake-widget", size: "full" }],
		});
		expect(parsed.success).toBe(false);

		const oversized = saveDashboardLayoutInput.safeParse({
			layout: Array.from({ length: 25 }, () => ({
				id: "recent-activity",
				size: "half",
			})),
		});
		expect(oversized.success).toBe(false);
	});

	it("treats a corrupted stored layout as the default", async () => {
		await seedUsers();
		await db.userDashboardLayout.upsert({
			where: {
				userId_dashboard: { userId: userB, dashboard: "overview" },
			},
			create: {
				userId: userB,
				dashboard: "overview",
				layout: [{ id: "not-a-widget", size: "huge" }],
			},
			update: { layout: [{ id: "not-a-widget", size: "huge" }] },
		});

		const read = await service.layout(userB);
		expect(read.layout).toBeNull();
	});

	it("validates every persisted layout with the schema", () => {
		const valid = dashboardLayout.safeParse([
			{ id: "sales-dashboard", size: "full" },
			{ id: "deals-in-progress", size: "half" },
		]);
		expect(valid.success).toBe(true);
	});
});
