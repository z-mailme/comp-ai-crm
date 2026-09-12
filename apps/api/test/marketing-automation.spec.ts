import { describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	CanvaRenderStatus,
	DriveAssetApprovalState,
	db,
	MarketingAutomationMode,
	MarketingContentStatus,
	PublishErrorCategory,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { MarketingAutomationService } from "../src/marketing/automation.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `auto-${suffix}`;
const userId = `auto-user-${marker}`;
const unitId = `auto-unit-${marker}`;

const service = new MarketingAutomationService(db);
const source = { userId, businessUnitId: unitId };

async function seed() {
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
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Automation User",
			email: `auto-${marker}@example.test`,
		},
		update: {},
	});
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		create: {
			id: `auto-member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.businessUnit.upsert({
		where: { id: unitId },
		create: {
			id: unitId,
			name: `Unit ${marker}`,
			slug: unitId,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
		update: {},
	});
}

async function registerAsset(spec: {
	driveFileId: string;
	approvalState?: DriveAssetApprovalState;
	service?: string;
}) {
	return service.registerAsset(source, {
		driveFileId: spec.driveFileId,
		fileName: `${spec.driveFileId}.jpg`,
		mimeType: "image/jpeg",
		service: spec.service ?? "Photography",
		approvalState: spec.approvalState ?? DriveAssetApprovalState.APPROVED,
	});
}

async function expectThrow(fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the call to throw.");
}

describe("marketing automation config", () => {
	it("returns approval-required defaults", async () => {
		await seed();
		const config = await service.config(source);
		expect(config.mode).toBe(MarketingAutomationMode.APPROVAL_REQUIRED);
		expect(config.autopilotEnabled).toBe(false);
		expect(config.mediaCooldownDays).toBe(14);
		expect(config.publishingLive).toBe(false);
		expect(config.services).toContain("360 Video Booth");
	});

	it("updates the mode and writes an audit row", async () => {
		await seed();
		const updated = await service.updateConfig(source, {
			mode: MarketingAutomationMode.MANUAL,
		});
		expect(updated.mode).toBe(MarketingAutomationMode.MANUAL);
		expect(updated.autopilotEnabled).toBe(false);

		const audit = await db.marketingAutomationAudit.findFirst({
			where: { businessUnitId: unitId, action: "config.update" },
		});
		expect(audit).not.toBeNull();

		await service.updateConfig(source, {
			mode: MarketingAutomationMode.APPROVAL_REQUIRED,
		});
	});
});

describe("automation content upsert", () => {
	it("creates then updates by external key without duplicating", async () => {
		await seed();
		const created = await service.upsertContent(source, {
			title: "Winter promo",
			externalKey: `soc-01-${marker}-1`,
			service: "360 Video Booth",
		});
		expect(created.created).toBe(true);
		expect(created.status).toBe(MarketingContentStatus.PLANNED);

		const updated = await service.upsertContent(source, {
			title: "Winter promo v2",
			externalKey: `soc-01-${marker}-1`,
		});
		expect(updated.created).toBe(false);
		expect(updated.id).toBe(created.id);
		expect(updated.title).toBe("Winter promo v2");

		const count = await db.marketingContent.count({
			where: { businessUnitId: unitId, externalKey: `soc-01-${marker}-1` },
		});
		expect(count).toBe(1);
	});

	it("lists the item in the plan window", async () => {
		await seed();
		const created = await service.upsertContent(source, {
			title: `Planned ${marker}`,
			scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
		});
		const plan = await service.plan(source, {});
		expect(plan.rows.some((row) => row.id === created.id)).toBe(true);
	});
});

describe("drive media selection", () => {
	it("selects the least-used approved asset and moves to MEDIA_SELECTED", async () => {
		await seed();
		const used = await registerAsset({ driveFileId: `used-${marker}` });
		await db.driveMediaAsset.update({
			where: { id: used.id },
			data: { timesUsed: 5 },
		});
		const fresh = await registerAsset({ driveFileId: `fresh-${marker}` });
		await registerAsset({
			driveFileId: `pending-${marker}`,
			approvalState: DriveAssetApprovalState.PENDING,
		});

		const content = await service.upsertContent(source, {
			title: `Media ${marker}`,
			service: "Photography",
		});
		const result = await service.requestMedia(source, {
			contentId: content.id,
		});

		expect(result.selected?.id).toBe(fresh.id);
		expect(result.reason).toBeNull();

		const row = await db.marketingContent.findUnique({
			where: { id: content.id },
		});
		expect(row?.status).toBe(MarketingContentStatus.MEDIA_SELECTED);
		expect(row?.selectedDriveAssetId).toBe(fresh.id);
	});

	it("excludes assets on cooldown and do_not_use_until", async () => {
		await seed();
		const cooling = await registerAsset({
			driveFileId: `cool-${marker}`,
			service: "Testimonials",
		});
		await db.driveMediaAsset.update({
			where: { id: cooling.id },
			data: { lastUsedAt: new Date() },
		});
		const held = await registerAsset({
			driveFileId: `held-${marker}`,
			service: "Testimonials",
		});
		await db.driveMediaAsset.update({
			where: { id: held.id },
			data: { doNotUseUntil: new Date(Date.now() + 5 * 86_400_000) },
		});

		const content = await service.upsertContent(source, {
			title: `Cooldown ${marker}`,
			service: "Testimonials",
		});
		const result = await service.requestMedia(source, {
			contentId: content.id,
		});
		expect(result.selected).toBeNull();
		expect(result.reason).toContain("No approved Drive asset");
	});

	it("records usage idempotently and advances the counters once", async () => {
		await seed();
		const asset = await registerAsset({ driveFileId: `usage-${marker}` });
		const input = {
			assetId: asset.id,
			context: "test",
			idempotencyKey: `soc-08-${marker}-1`,
		};
		const first = await service.recordUsage(source, input);
		const second = await service.recordUsage(source, input);
		expect(first.replayed).toBe(false);
		expect(second.replayed).toBe(true);
		expect(second.id).toBe(first.id);

		const reloaded = await db.driveMediaAsset.findUnique({
			where: { id: asset.id },
		});
		expect(reloaded?.timesUsed).toBe(1);
		expect(reloaded?.lastUsedAt).not.toBeNull();
	});
});

describe("copy and design stages", () => {
	it("saves copy and moves to COPY_GENERATED", async () => {
		await seed();
		const content = await service.upsertContent(source, {
			title: `Copy ${marker}`,
		});
		const saved = await service.saveCopy(source, {
			contentId: content.id,
			caption: "Book the booth.",
			headline: "360 nights",
			idempotencyKey: `soc-03-${marker}-1`,
		});
		expect(saved.status).toBe(MarketingContentStatus.COPY_GENERATED);
	});

	it("rejects copy on a cancelled item", async () => {
		await seed();
		const content = await service.upsertContent(source, {
			title: `Cancelled ${marker}`,
			status: MarketingContentStatus.CANCELLED,
		});
		const message = await expectThrow(() =>
			service.saveCopy(source, {
				contentId: content.id,
				caption: "nope",
				idempotencyKey: `soc-03-${marker}-2`,
			}),
		);
		expect(message).toContain("CANCELLED");
	});

	it("saves a render idempotently and moves to DESIGN_GENERATED", async () => {
		await seed();
		const content = await service.upsertContent(source, {
			title: `Design ${marker}`,
		});
		await service.saveCopy(source, {
			contentId: content.id,
			caption: "copy",
			idempotencyKey: `soc-03-${marker}-3`,
		});
		const render = await service.saveRender(source, {
			contentId: content.id,
			templateId: "tpl-1",
			format: "feed-square",
			platform: "INSTAGRAM",
			status: CanvaRenderStatus.READY,
			renderedUrl: "https://example.test/render.png",
			designId: "design-1",
			idempotencyKey: `soc-04-${marker}-1`,
		});
		expect(render.status).toBe(CanvaRenderStatus.READY);

		const replay = await service.saveRender(source, {
			contentId: content.id,
			templateId: "tpl-1",
			format: "feed-square",
			platform: "INSTAGRAM",
			status: CanvaRenderStatus.READY,
			renderedUrl: "https://example.test/render.png",
			designId: "design-1",
			idempotencyKey: `soc-04-${marker}-1`,
		});
		expect(replay.id).toBe(render.id);

		const count = await db.canvaRender.count({
			where: { idempotencyKey: `soc-04-${marker}-1` },
		});
		expect(count).toBe(1);

		const row = await db.marketingContent.findUnique({
			where: { id: content.id },
		});
		expect(row?.status).toBe(MarketingContentStatus.DESIGN_GENERATED);
	});

	it("refuses a render whose source asset is not approved", async () => {
		await seed();
		const asset = await registerAsset({
			driveFileId: `render-pending-${marker}`,
			approvalState: DriveAssetApprovalState.PENDING,
		});
		const content = await service.upsertContent(source, {
			title: `RenderGuard ${marker}`,
		});
		await service.saveCopy(source, {
			contentId: content.id,
			caption: "copy",
			idempotencyKey: `soc-03-${marker}-4`,
		});
		const message = await expectThrow(() =>
			service.saveRender(source, {
				contentId: content.id,
				templateId: "tpl-1",
				format: "feed-square",
				platform: "INSTAGRAM",
				sourceAssetId: asset.id,
				status: CanvaRenderStatus.QUEUED,
				idempotencyKey: `soc-04-${marker}-2`,
			}),
		);
		expect(message).toContain("not approved");
	});
});

describe("approval flow", () => {
	async function designedContent(title: string) {
		const content = await service.upsertContent(source, { title });
		await service.saveCopy(source, {
			contentId: content.id,
			caption: "copy",
			idempotencyKey: `copy-${title}`,
		});
		return content;
	}

	it("sends for approval once and approves as a user", async () => {
		await seed();
		const content = await designedContent(`Approve ${marker}`);
		const first = await service.sendApproval(source, {
			contentId: content.id,
		});
		expect(first.contentStatus).toBe(MarketingContentStatus.AWAITING_APPROVAL);
		expect(first.approval?.status).toBe("PENDING");

		const second = await service.sendApproval(source, {
			contentId: content.id,
		});
		expect(second.approval?.id).toBe(first.approval?.id);

		const decided = await service.decideApproval(source, {
			contentId: content.id,
			decision: "APPROVE",
		});
		expect(decided.contentStatus).toBe(MarketingContentStatus.APPROVED);
		expect(decided.approval?.status).toBe("APPROVED");
	});

	it("fails closed for autopilot decisions", async () => {
		await seed();
		const content = await designedContent(`Autopilot ${marker}`);
		await service.sendApproval(source, { contentId: content.id });
		const message = await expectThrow(() =>
			service.decideApproval(source, {
				contentId: content.id,
				decision: "APPROVE",
				actor: "AUTOPILOT",
			}),
		);
		expect(message).toContain("Autopilot decisions are disabled");
	});
});

describe("publish records", () => {
	async function approvedContent(title: string) {
		const content = await service.upsertContent(source, { title });
		await service.saveCopy(source, {
			contentId: content.id,
			caption: "copy",
			idempotencyKey: `copy-${title}`,
		});
		await service.sendApproval(source, { contentId: content.id });
		await service.decideApproval(source, {
			contentId: content.id,
			decision: "APPROVE",
		});
		return content;
	}

	it("records a successful publish once per idempotency key", async () => {
		await seed();
		const content = await approvedContent(`Publish ${marker}`);
		const input = {
			contentId: content.id,
			platform: "FACEBOOK",
			success: true,
			externalPostId: "fb-123",
			externalPostUrl: "https://facebook.test/123",
			idempotencyKey: `soc-06-${marker}-1`,
		};
		const first = await service.publishResult(source, input);
		expect(first.replayed).toBe(false);
		expect(first.externalPostId).toBe("fb-123");

		const second = await service.publishResult(source, input);
		expect(second.replayed).toBe(true);
		expect(second.id).toBe(first.id);

		const attempts = await db.socialPublishAttempt.count({
			where: { idempotencyKey: `soc-06-${marker}-1` },
		});
		expect(attempts).toBe(1);

		const row = await db.marketingContent.findUnique({
			where: { id: content.id },
		});
		expect(row?.status).toBe(MarketingContentStatus.PUBLISHED);
		expect(row?.publishedAt).not.toBeNull();
	});

	it("refuses to publish when the selected media lost approval", async () => {
		await seed();
		const asset = await registerAsset({ driveFileId: `guard-${marker}` });
		const content = await service.upsertContent(source, {
			title: `Guard ${marker}`,
			service: "Photography",
		});
		await service.requestMedia(source, { contentId: content.id });
		await service.saveCopy(source, {
			contentId: content.id,
			caption: "copy",
			idempotencyKey: `copy-guard-${marker}`,
		});
		await service.sendApproval(source, { contentId: content.id });
		await service.decideApproval(source, {
			contentId: content.id,
			decision: "APPROVE",
		});
		await db.driveMediaAsset.update({
			where: { id: asset.id },
			data: { approvalState: DriveAssetApprovalState.REJECTED },
		});

		const message = await expectThrow(() =>
			service.publishResult(source, {
				contentId: content.id,
				platform: "INSTAGRAM",
				success: true,
				externalPostId: "ig-1",
				idempotencyKey: `soc-06-${marker}-2`,
			}),
		);
		expect(message).toContain("not approved");
	});

	it("keeps the item in PUBLISHING while a retry is pending", async () => {
		await seed();
		const content = await approvedContent(`Retry ${marker}`);
		await db.marketingContent.update({
			where: { id: content.id },
			data: { status: MarketingContentStatus.PUBLISHING },
		});

		const attempt = await service.recordFailure(source, {
			contentId: content.id,
			platform: "FACEBOOK",
			errorCategory: PublishErrorCategory.RATE_LIMIT,
			errorSummary: "rate limited",
			retryCount: 1,
			willRetry: true,
			idempotencyKey: `soc-06-${marker}-3`,
		});
		expect(attempt.success).toBe(false);

		const row = await db.marketingContent.findUnique({
			where: { id: content.id },
		});
		expect(row?.status).toBe(MarketingContentStatus.PUBLISHING);

		await service.recordFailure(source, {
			contentId: content.id,
			platform: "FACEBOOK",
			errorCategory: PublishErrorCategory.PROVIDER,
			errorSummary: "permanent",
			retryCount: 2,
			willRetry: false,
			idempotencyKey: `soc-06-${marker}-4`,
		});
		const after = await db.marketingContent.findUnique({
			where: { id: content.id },
		});
		expect(after?.status).toBe(MarketingContentStatus.FAILED);
	});
});

describe("analytics ingestion", () => {
	it("upserts metrics per content, platform and date", async () => {
		await seed();
		const content = await service.upsertContent(source, {
			title: `Metrics ${marker}`,
		});
		const base = {
			contentId: content.id,
			platform: "INSTAGRAM",
			date: "2026-09-10",
		};
		await service.saveMetrics(source, { ...base, impressions: 10 });
		const updated = await service.saveMetrics(source, {
			...base,
			impressions: 42,
			likes: 3,
		});
		expect(updated.impressions).toBe(42);
		expect(updated.likes).toBe(3);

		const count = await db.marketingContentMetric.count({
			where: { contentId: content.id },
		});
		expect(count).toBe(1);
	});
});

describe("business brain context", () => {
	it("returns compact knowledge without mailbox data", async () => {
		await seed();
		await db.businessKnowledge.create({
			data: {
				businessUnitId: unitId,
				kind: "PRICING",
				subject: `360 booth from R4500 ${marker}`,
				detail: "Includes operator",
				sourceType: "CRM",
				humanConfirmed: true,
			},
		});

		const context = await service.brainContext(source, {});
		expect(context.service).toBeNull();
		expect(
			context.pricing.some((row) => row.subject.includes("360 booth")),
		).toBe(true);
		expect(context.bookingTrends.windowDays).toBe(90);
		expect(context.bookingTrends.totalBookings).toBeGreaterThanOrEqual(0);
	});
});
