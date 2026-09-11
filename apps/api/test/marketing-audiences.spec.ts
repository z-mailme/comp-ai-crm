import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	BookingResourceType,
	BookingStatus,
	BusinessUnitStatus,
	DealStage,
	db,
	MarketingIntegrationStatus,
	MarketingProvider,
	RecordSource,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { MarketingAudiencesService } from "../src/marketing/audiences.service";
import type { ListmonkConfig } from "../src/marketing/listmonk.client";

const marker = `marketing-aud-${process.env.TEST_RUN_ID ?? crypto.randomUUID()}`;
const userId = `user-${marker}`;
const unitId = `unit-${marker}`;
const companyId = `company-${marker}`;

const context = { userId, businessUnitId: unitId };

class FakeListmonkClient {
	lists: Array<{ name: string; description?: string }> = [];
	createdSubscribers: Array<{
		email: string;
		name: string;
		listIds: number[];
	}> = [];
	existingSubscribers: Array<{
		id: number;
		email: string;
		name: string;
		status: string;
		lists: Array<{ id: number; subscription_status: string }>;
	}> = [];

	async createList(
		_config: ListmonkConfig,
		input: { name: string; description?: string },
	) {
		this.lists.push(input);
		return {
			data: {
				id: 601,
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
		return { data: { id: 8000 + this.createdSubscribers.length } };
	}
}

const listmonk = new FakeListmonkClient();
const service = new MarketingAudiencesService(db, listmonk as never);

async function seedContact(input: {
	key: string;
	consent?: boolean;
	unsubscribed?: boolean;
	company?: boolean;
	deal?: { stage: DealStage; amount?: number };
	booking?: { status: BookingStatus; resource?: BookingResourceType };
	utmCampaign?: string;
}) {
	const email = `${input.key}@${marker}.test`;
	const contact = await db.contact.create({
		data: {
			firstName: input.key,
			email,
			source: RecordSource.MANUAL,
			emailMarketingAllowed: input.consent ?? false,
			unsubscribeDate: input.unsubscribed ? new Date() : null,
			companyId: input.company ? companyId : undefined,
		},
	});

	if (input.utmCampaign) {
		await db.trackedVisitor.create({
			data: {
				id: `visitor-${input.key}-${marker}`.slice(0, 64),
				contactId: contact.id,
				firstCampaign: input.utmCampaign,
				firstSource: "google",
			},
		});
	}

	if (input.deal) {
		const deal = await db.deal.create({
			data: {
				name: `Deal ${input.key} ${marker}`,
				companyId,
				ownerId: userId,
				stage: input.deal.stage,
				amount: input.deal.amount,
			},
		});
		await db.dealContact.create({
			data: { dealId: deal.id, contactId: contact.id },
		});
		if (input.booking) {
			const booking = await db.booking.create({
				data: {
					dealId: deal.id,
					status: input.booking.status,
					eventDate: new Date("2026-10-01"),
				},
			});
			if (input.booking.resource) {
				await db.bookingResource.create({
					data: {
						bookingId: booking.id,
						resourceType: input.booking.resource,
						quantity: 1,
					},
				});
			}
		}
	}

	return contact;
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
			name: "Audience Tester",
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
			name: `Audience Unit ${marker}`,
			slug: `audience-unit-${marker}`,
			status: BusinessUnitStatus.ACTIVE,
			ownerId: userId,
		},
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Audience Co ${marker}`,
			domain: `${marker}.test`,
			city: "Leeds",
			countryCode: "GB",
			source: RecordSource.MANUAL,
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

	await seedContact({
		key: "booked",
		consent: true,
		company: true,
		deal: { stage: DealStage.CLOSED_WON, amount: 2500 },
		booking: {
			status: BookingStatus.CONFIRMED,
			resource: BookingResourceType.PHOTO_BOOTH_360,
		},
		utmCampaign: "spring-sale",
	});
	await seedContact({ key: "leadonly", consent: true });
	await seedContact({
		key: "unsubbed",
		consent: true,
		unsubscribed: true,
		utmCampaign: "spring-sale",
	});
	await seedContact({ key: "silent", utmCampaign: "spring-sale" });
}

async function clean(): Promise<void> {
	await db.businessEvent.deleteMany({
		where: {
			type: { startsWith: "marketing.audience" },
			businessUnitId: unitId,
		},
	});
	await db.marketingAudience.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.marketingIntegration.deleteMany({
		where: { businessUnitId: unitId },
	});
	await db.bookingResource.deleteMany({
		where: { booking: { deal: { name: { contains: marker } } } },
	});
	await db.booking.deleteMany({
		where: { deal: { name: { contains: marker } } },
	});
	await db.dealContact.deleteMany({
		where: { deal: { name: { contains: marker } } },
	});
	await db.deal.deleteMany({ where: { name: { contains: marker } } });
	await db.trackedVisitor.deleteMany({
		where: { id: { contains: marker } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${marker}.test` } },
	});
	await db.company.deleteMany({ where: { id: companyId } });
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

describe("marketing audiences", () => {
	it("counts only consented contacts by default", async () => {
		const result = await service.count(context, {
			rules: { consent: "allowed", utmCampaigns: ["spring-sale"] },
		});
		expect(result.count).toBe(1);
	});

	it("evaluates deal, booking, service and company filters", async () => {
		const result = await service.count(context, {
			rules: {
				consent: "any",
				dealStages: [DealStage.CLOSED_WON],
				bookingStatuses: [BookingStatus.CONFIRMED],
				resourceTypes: [BookingResourceType.PHOTO_BOOTH_360],
				companyCities: ["leeds"],
				minDealAmount: 2000,
				hasBooking: true,
			},
		});
		expect(result.count).toBe(1);
	});

	it("counts contacts without any booking", async () => {
		const result = await service.count(context, {
			rules: { consent: "any", hasBooking: false },
		});
		expect(result.count).toBe(3);
	});

	it("creates, updates and archives an audience with a live count", async () => {
		const created = await service.create(context, {
			name: `Spring leads ${marker}`,
			rules: { consent: "allowed", utmCampaigns: ["spring-sale"] },
		});
		expect(created.count).toBe(1);
		expect(created.status).toBe("active");

		const updated = await service.update(context, {
			id: created.id,
			rules: { consent: "any", utmCampaigns: ["spring-sale"] },
		});
		expect(updated.count).toBe(3);

		const list = await service.list(context);
		expect(list.audiences.some((row) => row.id === created.id)).toBe(true);
		expect(list.consent.allowed).toBe(2);
		expect(list.consent.unsubscribed).toBe(1);

		const archived = await service.archive(context, { id: created.id });
		expect(archived.status).toBe("archived");
	});

	it("exports only consented matching contacts to a listmonk list", async () => {
		const audience = await service.create(context, {
			name: `Export ${marker}`,
			rules: { consent: "allowed", utmCampaigns: ["spring-sale"] },
		});

		const first = await service.exportToList(context, { id: audience.id });
		expect(first.listId).toBe(601);
		expect(first.synced).toBe(1);
		expect(listmonk.lists).toHaveLength(1);
		expect(listmonk.createdSubscribers.map((row) => row.email)).toEqual([
			`booked@${marker}.test`,
		]);

		listmonk.existingSubscribers = [
			{
				id: 1,
				email: `booked@${marker}.test`,
				name: "booked",
				status: "enabled",
				lists: [{ id: 601, subscription_status: "confirmed" }],
			},
		];
		const second = await service.exportToList(context, { id: audience.id });
		expect(second.synced).toBe(0);
		expect(second.existing).toBe(1);
		expect(listmonk.lists).toHaveLength(1);
	});
});
