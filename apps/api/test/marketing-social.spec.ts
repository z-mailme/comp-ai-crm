import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ApprovalRequestStatus,
	BusinessUnitStatus,
	db,
	SocialAccountStatus,
	SocialPostStatus,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { MarketingSocialService } from "../src/marketing/social.service";

const marker = `social-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;

const service = new MarketingSocialService(db);
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
			name: "Social Tester",
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
			name: `Social Unit ${marker}`,
			slug: `social-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.socialInteraction.deleteMany({ where: { businessUnitId: unitId } });
	await db.socialPostTarget.deleteMany({
		where: { post: { businessUnitId: unitId } },
	});
	await db.approvalRequest.deleteMany({ where: { businessUnitId: unitId } });
	await db.businessEvent.deleteMany({ where: { businessUnitId: unitId } });
	await db.socialPost.deleteMany({ where: { businessUnitId: unitId } });
	await db.socialAccount.deleteMany({ where: { businessUnitId: unitId } });
	await db.marketingContent.deleteMany({ where: { businessUnitId: unitId } });
	await db.marketingCampaign.deleteMany({ where: { businessUnitId: unitId } });
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

async function registerAccount() {
	return service.registerAccount(context, {
		provider: "META_FACEBOOK",
		externalAccountId: `page-${marker}`,
		displayName: `Page ${marker}`,
		accessToken: `token-${marker}`,
		scopes: ["pages_manage_posts"],
	});
}

describe("social accounts", () => {
	it("registers, lists and disconnects a Meta account without leaking tokens", async () => {
		const account = await registerAccount();
		expect(account.status).toBe(SocialAccountStatus.CONNECTED);
		expect(account.publishing).toBe(true);

		const listed = await service.listAccounts(context);
		expect(listed.rows.some((row) => row.id === account.id)).toBe(true);
		expect(JSON.stringify(listed)).not.toContain(`token-${marker}`);

		const disconnected = await service.disconnectAccount(context, {
			id: account.id,
		});
		expect(disconnected.status).toBe(SocialAccountStatus.DISCONNECTED);

		const stored = await db.socialAccount.findUnique({
			where: { id: account.id },
		});
		expect(stored?.credentials).toBeNull();
	});

	it("refuses providers that are not supported yet", async () => {
		let rejected: string | null = null;
		try {
			await service.registerAccount(context, {
				provider: "TIKTOK",
				externalAccountId: `tt-${marker}`,
				displayName: "TikTok",
				accessToken: "x",
			});
		} catch (error) {
			rejected = error instanceof Error ? error.message : String(error);
		}
		expect(rejected).toContain("not supported yet");
	});
});

describe("social posts", () => {
	it("creates posts idempotently and runs the approval flow", async () => {
		const account = await registerAccount();

		const first = await service.createPost(context, {
			caption: `Grand opening ${marker}`,
			accountIds: [account.id],
			idempotencyKey: `post-${marker}`,
			scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
		});
		expect(first.status).toBe(SocialPostStatus.DRAFT);
		expect(first.targets).toHaveLength(1);

		const retry = await service.createPost(context, {
			caption: `Grand opening ${marker}`,
			accountIds: [account.id],
			idempotencyKey: `post-${marker}`,
		});
		expect(retry.id).toBe(first.id);

		const submitted = await service.submitForApproval(context, {
			id: first.id,
		});
		expect(submitted.post.status).toBe(SocialPostStatus.PENDING_APPROVAL);

		const approval = await db.approvalRequest.findUnique({
			where: { id: submitted.approvalRequestId },
		});
		expect(approval?.type).toBe("marketing.social.publish");
		expect(approval?.status).toBe(ApprovalRequestStatus.PENDING);

		const decided = await service.decide(context, {
			id: first.id,
			decision: "APPROVE",
		});
		expect(decided.status).toBe(SocialPostStatus.SCHEDULED);
		expect(decided.approvedById).toBe(userId);

		const resolved = await db.approvalRequest.findUnique({
			where: { id: submitted.approvalRequestId },
		});
		expect(resolved?.status).toBe(ApprovalRequestStatus.APPROVED);
	});

	it("refuses to publish while provider docs are unverified and autopilot is off", async () => {
		const account = await registerAccount();
		const post = await service.createPost(context, {
			caption: `Publish gate ${marker}`,
			accountIds: [account.id],
		});
		await service.submitForApproval(context, { id: post.id });
		await service.decide(context, { id: post.id, decision: "APPROVE" });

		let rejected: string | null = null;
		try {
			await service.publish(context, { id: post.id });
		} catch (error) {
			rejected = error instanceof Error ? error.message : String(error);
		}
		expect(rejected).toContain("not been verified");

		const after = await db.socialPost.findUnique({ where: { id: post.id } });
		expect(after?.status).toBe(SocialPostStatus.APPROVED);
	});

	it("requires approval before publishing", async () => {
		const account = await registerAccount();
		const post = await service.createPost(context, {
			caption: `Unapproved ${marker}`,
			accountIds: [account.id],
		});

		let rejected: string | null = null;
		try {
			await service.publish(context, { id: post.id });
		} catch (error) {
			rejected = error instanceof Error ? error.message : String(error);
		}
		expect(rejected).toContain("requires an approved post");
	});

	it("feeds the calendar with posts, content and campaigns", async () => {
		const account = await registerAccount();
		const when = new Date(Date.now() + 2 * 86_400_000);

		await service.createPost(context, {
			caption: `Calendar post ${marker}`,
			accountIds: [account.id],
			scheduledAt: when.toISOString(),
		});
		await db.marketingContent.create({
			data: {
				businessUnitId: unitId,
				title: `Calendar content ${marker}`,
				status: "SCHEDULED",
				scheduledAt: when,
			},
		});
		await db.marketingCampaign.create({
			data: {
				businessUnitId: unitId,
				name: `Calendar campaign ${marker}`,
				status: "ACTIVE",
				startDate: new Date(Date.now() - 86_400_000),
				endDate: when,
			},
		});

		const feed = await service.calendar(context, {
			from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
			to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
		});

		const kinds = new Set(feed.items.map((item) => item.kind));
		expect(kinds.has("SOCIAL_POST")).toBe(true);
		expect(kinds.has("CONTENT")).toBe(true);
		expect(kinds.has("CAMPAIGN")).toBe(true);
		expect(feed.items.some((item) => item.title.includes(marker))).toBe(true);
	});

	it("reports the inbox as unavailable without connected accounts", async () => {
		const otherUnit = `unit-inbox-${marker}`;
		await db.businessUnit.create({
			data: {
				id: otherUnit,
				name: `Inbox Unit ${marker}`,
				slug: `inbox-unit-${marker}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
		});
		try {
			const empty = await service.inbox({
				userId,
				businessUnitId: otherUnit,
			});
			expect(empty.available).toBe(false);

			await service.registerAccount(
				{ userId, businessUnitId: otherUnit },
				{
					provider: "META_FACEBOOK",
					externalAccountId: `inbox-page-${marker}`,
					displayName: `Inbox Page ${marker}`,
					accessToken: `token-inbox-${marker}`,
				},
			);
			const withAccount = await service.inbox({
				userId,
				businessUnitId: otherUnit,
			});
			expect(withAccount.available).toBe(true);
			expect(withAccount.rows).toHaveLength(0);
		} finally {
			await db.socialAccount.deleteMany({
				where: { businessUnitId: otherUnit },
			});
			await db.businessUnit.deleteMany({ where: { id: otherUnit } });
		}
	});
});
