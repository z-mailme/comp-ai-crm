import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	db,
	MarketingIntegrationStatus,
	MarketingProvider,
	RecordSource,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { MarketingEmailService } from "../src/marketing/email.service";
import type { ListmonkConfig } from "../src/marketing/listmonk.client";

const marker = `marketing-email-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;

const context = { userId, businessUnitId: unitId };

class FakeListmonkClient {
	campaigns: Array<{
		name: string;
		subject: string;
		body: string;
		listIds: number[];
		fromEmail?: string;
		tags?: string[];
	}> = [];
	updates: Array<{ campaignId: number; sendAt?: string }> = [];
	statuses: Array<{ campaignId: number; status: string }> = [];
	createdSubscribers: Array<{
		email: string;
		name: string;
		listIds: number[];
	}> = [];
	lists: Array<{ name: string; description?: string }> = [];
	existingSubscribers: Array<{
		id: number;
		email: string;
		name: string;
		status: string;
		lists: Array<{ id: number; subscription_status: string }>;
	}> = [];

	async createCampaign(
		_config: ListmonkConfig,
		input: (typeof this.campaigns)[0],
	) {
		this.campaigns.push(input);
		return { data: { id: 9001, status: "draft" } };
	}

	async updateCampaign(
		_config: ListmonkConfig,
		input: { campaignId: number; sendAt?: string },
	) {
		this.updates.push(input);
		return { data: { id: input.campaignId, status: "draft" } };
	}

	async updateCampaignStatus(
		_config: ListmonkConfig,
		input: { campaignId: number; status: string },
	) {
		this.statuses.push(input);
		return { data: { id: input.campaignId, status: input.status } };
	}

	async createList(
		_config: ListmonkConfig,
		input: { name: string; description?: string },
	) {
		this.lists.push(input);
		return {
			data: {
				id: 501,
				name: input.name,
				status: "active",
				subscriber_count: 0,
			},
		};
	}

	async subscribers(
		_config: ListmonkConfig,
		_input: { listId?: number; page: number; perPage: number | "all" },
	) {
		return {
			total: this.existingSubscribers.length,
			subscribers: this.existingSubscribers,
		};
	}

	async createSubscriber(
		_config: ListmonkConfig,
		input: { email: string; name: string; listIds: number[] },
	) {
		this.createdSubscribers.push(input);
		return { data: { id: 7000 + this.createdSubscribers.length } };
	}
}

const listmonk = new FakeListmonkClient();
const service = new MarketingEmailService(db, listmonk as never);

async function expectError(promise: Promise<unknown>, fragment: string) {
	let message = "";
	try {
		await promise;
	} catch (error) {
		message = error instanceof Error ? error.message : String(error);
	}
	expect(message).toContain(fragment);
}

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
			name: "Email Tester",
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
			name: `Email Unit ${marker}`,
			slug: `email-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.marketingIntegration.create({
		data: {
			businessUnitId: unitId,
			provider: MarketingProvider.LISTMONK,
			label: "Listmonk",
			status: MarketingIntegrationStatus.CONNECTED,
			config: {
				baseUrl: "https://listmonk.example.test",
				authMethod: "token",
			},
			secrets: { token: "test-token" },
			createdById: userId,
		},
	});
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: { type: { startsWith: "marketing.email" }, businessUnitId: unitId },
	});
	await db.approvalRequest.deleteMany({
		where: { businessUnitId: unitId, type: "marketing.email.schedule" },
	});
	await db.marketingEmailTemplate.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.marketingIntegration.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${marker}.test` } },
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

describe("marketing email templates", () => {
	it("creates, renders, updates and archives a block template", async () => {
		const created = await service.createTemplate(context, {
			name: `Welcome ${marker}`,
			previewText: "A warm welcome",
			blocks: [
				{ kind: "header", text: "Welcome <b>friend</b>" },
				{ kind: "text", text: "First paragraph.\n\nSecond paragraph." },
				{ kind: "cta", label: "Book now", url: "https://example.test/book" },
				{ kind: "footer", text: "Comp AI Studio" },
				{ kind: "unsubscribe" },
			],
		});
		expect(created.status).toBe("draft");

		const rendered = await service.renderTemplate(context, { id: created.id });
		expect(rendered.html).toContain("Welcome &lt;b&gt;friend&lt;/b&gt;");
		expect(rendered.html).toContain("A warm welcome");
		expect(rendered.html).toContain("{{ UnsubscribeURL }}");
		expect(rendered.html).toContain("https://example.test/book");

		const updated = await service.updateTemplate(context, {
			id: created.id,
			name: `Welcome v2 ${marker}`,
		});
		expect(updated.name).toBe(`Welcome v2 ${marker}`);
		expect(updated.status).toBe("ready");

		const list = await service.templates(context);
		expect(list.templates.some((row) => row.id === created.id)).toBe(true);

		const archived = await service.archiveTemplate(context, { id: created.id });
		expect(archived.status).toBe("archived");
		await expectError(
			service.updateTemplate(context, { id: created.id, name: "Nope" }),
			"Archived templates cannot be edited.",
		);
	});
});

describe("marketing email campaigns", () => {
	it("composes a listmonk campaign from a stored template", async () => {
		const template = await service.createTemplate(context, {
			name: `Compose ${marker}`,
			blocks: [
				{ kind: "header", text: "Spring Sale" },
				{ kind: "unsubscribe", text: "Leave this list" },
			],
		});

		const campaign = await service.composeCampaign(context, {
			name: `Spring Sale ${marker}`,
			subject: "Spring is here",
			templateId: template.id,
			fromEmail: "Studio <hello@example.test>",
			listIds: [501],
			tags: ["spring"],
		});

		expect(campaign.id).toBe(9001);
		expect(listmonk.campaigns).toHaveLength(1);
		const sent = listmonk.campaigns[0];
		if (!sent) throw new Error("No campaign recorded by the fake client.");
		expect(sent.subject).toBe("Spring is here");
		expect(sent.fromEmail).toBe("Studio <hello@example.test>");
		expect(sent.listIds).toEqual([501]);
		expect(sent.body).toContain("Spring Sale");
		expect(sent.body).toContain("{{ UnsubscribeURL }}");
		expect(sent.body).toContain("Leave this list");
	});

	it("rejects composing without a template or body", async () => {
		await expectError(
			service.composeCampaign(context, {
				name: `Empty ${marker}`,
				subject: "Nothing",
				listIds: [501],
			}),
			"Provide a templateId or a raw body.",
		);
	});
});

describe("marketing email schedule approvals", () => {
	it("requires approval before scheduling with listmonk", async () => {
		const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const request = await service.requestSchedule(context, {
			campaignId: 9001,
			campaignName: `Spring Sale ${marker}`,
			sendAt,
		});
		expect(request.status).toBe("PENDING");
		expect(listmonk.statuses).toHaveLength(0);

		const decided = await service.decideSchedule(context, {
			approvalRequestId: request.approvalRequestId,
			decision: "APPROVE",
		});
		expect(decided.status).toBe("APPROVED");
		expect(listmonk.updates).toHaveLength(1);
		expect(listmonk.updates[0]?.sendAt).toBe(sendAt);
		expect(listmonk.statuses).toEqual([
			{ campaignId: 9001, status: "scheduled" },
		]);

		await expectError(
			service.decideSchedule(context, {
				approvalRequestId: request.approvalRequestId,
				decision: "APPROVE",
			}),
			"already been decided",
		);
	});

	it("rejects a schedule request without calling listmonk", async () => {
		const sendAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
		const request = await service.requestSchedule(context, {
			campaignId: 9002,
			campaignName: `Reject ${marker}`,
			sendAt,
		});

		const decided = await service.decideSchedule(context, {
			approvalRequestId: request.approvalRequestId,
			decision: "REJECT",
			note: "Not this week",
		});
		expect(decided.status).toBe("REJECTED");
		expect(listmonk.updates).toHaveLength(1);
		expect(listmonk.statuses).toHaveLength(1);
	});

	it("refuses to schedule in the past", async () => {
		await expectError(
			service.requestSchedule(context, {
				campaignId: 9003,
				campaignName: `Past ${marker}`,
				sendAt: new Date(Date.now() - 60_000).toISOString(),
			}),
			"must be in the future",
		);
	});
});

describe("marketing email subscriber sync", () => {
	it("syncs only consented contacts and never re-adds existing subscribers", async () => {
		await db.contact.create({
			data: {
				firstName: "Allowed",
				email: `allowed@${marker}.test`,
				source: RecordSource.MANUAL,
				emailMarketingAllowed: true,
				marketingConsentSource: "form",
				consentDate: new Date(),
			},
		});
		await db.contact.create({
			data: {
				firstName: "Unsubscribed",
				email: `unsubscribed@${marker}.test`,
				source: RecordSource.MANUAL,
				emailMarketingAllowed: true,
				unsubscribeDate: new Date(),
			},
		});
		await db.contact.create({
			data: {
				firstName: "NoConsent",
				email: `noconsent@${marker}.test`,
				source: RecordSource.MANUAL,
			},
		});
		listmonk.existingSubscribers = [
			{
				id: 1,
				email: `existing@${marker}.test`,
				name: "Existing",
				status: "enabled",
				lists: [{ id: 501, subscription_status: "confirmed" }],
			},
		];
		await db.contact.create({
			data: {
				firstName: "Existing",
				email: `existing@${marker}.test`,
				source: RecordSource.MANUAL,
				emailMarketingAllowed: true,
			},
		});

		const result = await service.syncList(context, { listId: 501 });

		expect(result.synced).toBe(1);
		expect(result.existing).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.consentBlocked).toBe(2);
		expect(listmonk.createdSubscribers).toEqual([
			{
				email: `allowed@${marker}.test`,
				name: "Allowed",
				listIds: [501],
			},
		]);
	});
});
