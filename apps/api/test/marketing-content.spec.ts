import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ApprovalRequestStatus,
	BusinessUnitStatus,
	db,
	MarketingContentStatus,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { MarketingContentService } from "../src/marketing/content.service";
import { MarketingMediaService } from "../src/marketing/media.service";

const marker = `content-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;

const agent = new AgentTriggerService(db);
const service = new MarketingContentService(db, agent);
const media = new MarketingMediaService(db);

const context = { userId, businessUnitId: unitId };

async function seed(): Promise<void> {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.create({
		data: {
			id: userId,
			name: "Content Tester",
			email: `${userId}@example.test`,
		},
	});
	await db.member.create({
		data: {
			id: `member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
	});
	await db.businessUnit.create({
		data: {
			id: unitId,
			name: `Content Unit ${marker}`,
			slug: `content-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.marketingContentMedia.deleteMany({
		where: { content: { businessUnitId: unitId } },
	});
	await db.marketingMediaAsset.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.approvalRequest.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.businessEvent.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.agentTask.deleteMany({
		where: { kind: "marketing-content-assist" },
	});
	await db.marketingContent.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.businessUnit.deleteMany({ where: { id: unitId } });
	await db.member.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await seed();
});

afterAll(async () => {
	await clean();
});

describe("marketing content", () => {
	it("creates, lists, updates, duplicates and archives content", async () => {
		const created = await service.create(context, {
			title: `Launch Post ${marker}`,
			platforms: ["INSTAGRAM", "LINKEDIN"],
			caption: "We are live.",
			hashtags: ["launch"],
		});
		expect(created.status).toBe(MarketingContentStatus.DRAFT);
		expect(created.platforms).toEqual(["INSTAGRAM", "LINKEDIN"]);

		const listed = await service.list(context, {});
		expect(listed.rows.some((row) => row.id === created.id)).toBe(true);

		const updated = await service.update(context, {
			id: created.id,
			caption: "We are live this week.",
		});
		expect(updated.caption).toBe("We are live this week.");

		const copy = await service.duplicate(context, { id: created.id });
		expect(copy.title).toContain("(copy)");
		expect(copy.caption).toBe("We are live this week.");

		await service.archive(context, { id: copy.id });
		const afterArchive = await service.list(context, {});
		expect(afterArchive.rows.some((row) => row.id === copy.id)).toBe(false);
	});

	it("runs the review flow through the approval surface", async () => {
		const created = await service.create(context, {
			title: `Review Post ${marker}`,
			caption: "Needs a second pair of eyes.",
		});

		const submitted = await service.submitForReview(context, {
			id: created.id,
		});
		expect(submitted.content.status).toBe(
			MarketingContentStatus.READY_FOR_REVIEW,
		);

		const approval = await db.approvalRequest.findUnique({
			where: { id: submitted.approvalRequestId },
		});
		expect(approval?.status).toBe(ApprovalRequestStatus.PENDING);
		expect(approval?.type).toBe("marketing.content.review");

		const approved = await service.decide(context, {
			id: created.id,
			decision: "APPROVE",
		});
		expect(approved.status).toBe(MarketingContentStatus.APPROVED);
		expect(approved.approvedById).toBe(userId);

		const resolved = await db.approvalRequest.findUnique({
			where: { id: submitted.approvalRequestId },
		});
		expect(resolved?.status).toBe(ApprovalRequestStatus.APPROVED);
	});

	it("schedules only approved content", async () => {
		const draft = await service.create(context, {
			title: `Draft Post ${marker}`,
		});

		let rejected: string | null = null;
		try {
			await service.schedule(context, {
				id: draft.id,
				scheduledAt: new Date().toISOString(),
			});
		} catch (error) {
			rejected = error instanceof Error ? error.message : String(error);
		}
		expect(rejected).toContain("Only approved content can be scheduled.");

		const created = await service.create(context, {
			title: `Schedulable ${marker}`,
		});
		await service.submitForReview(context, { id: created.id });
		await service.decide(context, { id: created.id, decision: "APPROVE" });

		const when = new Date(Date.now() + 86_400_000).toISOString();
		const scheduled = await service.schedule(context, {
			id: created.id,
			scheduledAt: when,
		});
		expect(scheduled.status).toBe(MarketingContentStatus.SCHEDULED);
		expect(scheduled.scheduledAt).toBe(when);
	});

	it("queues a marketing-content-assist agent task", async () => {
		const created = await service.create(context, {
			title: `Assist Post ${marker}`,
		});

		const result = await service.requestAiAssist(context, {
			id: created.id,
			instruction: "Announce the winter menu.",
		});
		expect(result.queued).toBe(true);

		const task = await db.agentTask.findFirst({
			where: { kind: "marketing-content-assist" },
			orderBy: { createdAt: "desc" },
		});
		expect(task).not.toBeNull();
		const payload = task?.payload as { contentId?: string } | null;
		expect(payload?.contentId).toBe(created.id);
	});
});

describe("marketing media", () => {
	it("attaches, lists and detaches assets on content", async () => {
		const content = await service.create(context, {
			title: `Media Post ${marker}`,
		});
		const asset = await db.marketingMediaAsset.create({
			data: {
				businessUnitId: unitId,
				fileName: `hero-${marker}.png`,
				mimeType: "image/png",
				sizeBytes: 128,
				sha256: `sha-${marker}`,
				blobUrl: `https://blob.example.test/${marker}.png`,
				uploadedById: userId,
			},
		});

		await media.attach(context, { contentId: content.id, assetId: asset.id });

		const detail = await service.detail(context, { id: content.id });
		expect(detail.media).toHaveLength(1);
		expect(detail.media[0]?.fileName).toBe(`hero-${marker}.png`);

		const listed = await media.list(context, {});
		expect(listed.rows.some((row) => row.id === asset.id)).toBe(true);

		await media.detach(context, { contentId: content.id, assetId: asset.id });
		const afterDetach = await service.detail(context, { id: content.id });
		expect(afterDetach.media).toHaveLength(0);
	});

	it("refuses uploads when media storage is not configured", async () => {
		if (process.env.BLOB_READ_WRITE_TOKEN) return;

		await expect(
			media.upload(context, {
				fileName: "photo.png",
				mimeType: "image/png",
				bytes: Buffer.from("fake"),
			}),
		).rejects.toThrow("Media storage is not configured");
	});
});
