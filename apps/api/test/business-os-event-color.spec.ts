import { describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { setEventColorInput } from "../src/business-os/business-os.contracts";
import { BusinessOsService } from "../src/business-os/business-os.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { ConversionService } from "../src/currency/conversion.service";
import type {
	CalendarClient,
	EventsPage,
	EventsQuery,
	GoogleEvent,
} from "../src/google/calendar.client";
import { CalendarSyncService } from "../src/google/calendar-sync.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `event-color-${suffix}`;
const userId = `event-color-user-${marker}`;
const userEmail = `rep-${marker}@example.test`;
const unitAId = `event-color-unit-a-${marker}`;
const unitBId = `event-color-unit-b-${marker}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	meetingSoon: async () => undefined,
} as unknown as AgentTriggerService;

class FakeCalendar {
	private readonly pages = new Map<string, EventsPage>();

	setPage(pageToken: string | undefined, page: EventsPage): void {
		this.pages.set(pageToken ?? "", page);
	}

	async listEvents(
		_accessToken: string,
		query: EventsQuery,
	): Promise<{ outcome: "ok"; data: EventsPage }> {
		return { outcome: "ok", data: this.pages.get(query.pageToken ?? "") ?? {} };
	}
}

type Kit = {
	calendar: FakeCalendar;
	row: MailboxSync;
	service: CalendarSyncService;
	businessOs: BusinessOsService;
};

async function kit(options: Partial<MailboxSync> = {}): Promise<Kit> {
	await seedWorkspace();
	await db.mailboxSync.deleteMany({
		where: { userId, source: "calendar" },
	});
	const row = await db.mailboxSync.create({
		data: {
			userId,
			source: "calendar",
			status: GoogleSyncStatus.IDLE,
			cursor: `color-sync-${crypto.randomUUID()}`,
			autoCreate: false,
			businessUnitId: options.businessUnitId ?? unitAId,
			initialBackfilledAt: new Date("2026-01-01T00:00:00.000Z"),
		},
	});
	const calendar = new FakeCalendar();
	const tokens = {
		async accessTokenFor(): Promise<{ outcome: "ok"; accessToken: string }> {
			return { outcome: "ok", accessToken: "token" };
		},
	} as unknown as MailboxTokenService;
	const state = new SyncStateService(db);
	const stamp = new ActivityStampService(db);
	const directory = new CompanyDirectoryService(agent);
	const log = new EnrichmentLogService(db, stamp);
	const match = new MailboxMatchService(db, directory, agent, log);
	const service = new CalendarSyncService(
		db,
		calendar as unknown as CalendarClient,
		tokens,
		match,
		state,
		stamp,
		agent,
	);

	return {
		calendar,
		row,
		service,
		businessOs: new BusinessOsService(db, new ConversionService(db)),
	};
}

function event(input: { id: string; title?: string }): GoogleEvent {
	const start = "2026-01-10T10:00:00.000Z";
	return {
		id: input.id,
		iCalUID: `${input.id}@google.test`,
		status: "confirmed",
		summary: input.title ?? `Meeting ${input.id}`,
		start: { dateTime: start },
		end: { dateTime: "2026-01-10T11:00:00.000Z" },
		originalStartTime: { dateTime: start },
		organizer: { email: userEmail, self: true },
		attendees: [],
	};
}

async function seedWorkspace() {
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
		create: { id: userId, name: "Colour User", email: userEmail },
		update: {},
	});
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		create: {
			id: `event-color-member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
		update: {},
	});
	for (const id of [unitAId, unitBId]) {
		await db.businessUnit.upsert({
			where: { id },
			create: {
				id,
				name: `Unit ${id}`,
				slug: id,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
			update: {},
		});
	}
}

async function syncOne(
	setup: Kit,
	id: string,
	title?: string,
): Promise<string> {
	setup.calendar.setPage(undefined, {
		items: [event({ id, title })],
		nextSyncToken: `next-${crypto.randomUUID()}`,
	});
	await setup.service.sync(setup.row);
	const stored = await db.calendarEvent.findFirstOrThrow({
		where: { iCalUid: `${id}@google.test` },
		select: { id: true },
	});
	return stored.id;
}

describe("businessOs.setEventColor", () => {
	it("persists a colour override and returns it", async () => {
		const setup = await kit();
		const eventId = await syncOne(setup, `${marker}-basic`);

		const result = await setup.businessOs.setEventColor(
			{ userId, businessUnitId: unitAId },
			{ eventId, color: "grape" },
		);

		expect(result).toEqual({ id: eventId, colorOverride: "grape" });
		const stored = await db.calendarEvent.findUniqueOrThrow({
			where: { id: eventId },
			select: { colorOverride: true },
		});
		expect(stored.colorOverride).toBe("grape");
	});

	it("clears the override with null", async () => {
		const setup = await kit();
		const eventId = await syncOne(setup, `${marker}-clear`);

		await setup.businessOs.setEventColor(
			{ userId, businessUnitId: unitAId },
			{ eventId, color: "basil" },
		);
		const cleared = await setup.businessOs.setEventColor(
			{ userId, businessUnitId: unitAId },
			{ eventId, color: null },
		);

		expect(cleared.colorOverride).toBeNull();
		const stored = await db.calendarEvent.findUniqueOrThrow({
			where: { id: eventId },
			select: { colorOverride: true },
		});
		expect(stored.colorOverride).toBeNull();
	});

	it("survives a Google re-sync while the sync updates other fields", async () => {
		const setup = await kit();
		const eventId = await syncOne(setup, `${marker}-resync`, "Original title");

		await setup.businessOs.setEventColor(
			{ userId, businessUnitId: unitAId },
			{ eventId, color: "peacock" },
		);
		await syncOne(setup, `${marker}-resync`, "Updated title");

		const stored = await db.calendarEvent.findUniqueOrThrow({
			where: { id: eventId },
			select: { title: true, colorOverride: true },
		});
		expect(stored.title).toBe("Updated title");
		expect(stored.colorOverride).toBe("peacock");
	});

	it("refuses an event outside the caller's business scope", async () => {
		const setup = await kit();
		const eventId = await syncOne(setup, `${marker}-scoped`);

		try {
			await setup.businessOs.setEventColor(
				{ userId, businessUnitId: unitBId },
				{ eventId, color: "tomato" },
			);
			throw new Error("setEventColor should have thrown");
		} catch (error) {
			expect(error instanceof Error ? error.message : "").toContain(
				"Calendar event not found.",
			);
		}

		const stored = await db.calendarEvent.findUniqueOrThrow({
			where: { id: eventId },
			select: { colorOverride: true },
		});
		expect(stored.colorOverride).toBeNull();
	});

	it("rejects an unknown colour at the input boundary", () => {
		const parsed = setEventColorInput.safeParse({
			eventId: "evt-1",
			color: "neon",
		});
		expect(parsed.success).toBe(false);

		const valid = setEventColorInput.safeParse({
			eventId: "evt-1",
			color: "sage",
		});
		expect(valid.success).toBe(true);
	});

	it("exposes the override through the calendar read", async () => {
		const setup = await kit();
		const eventId = await syncOne(setup, `${marker}-read`);

		await setup.businessOs.setEventColor(
			{ userId, businessUnitId: unitAId },
			{ eventId, color: "banana" },
		);

		const output = await setup.businessOs.calendar(
			{ userId, businessUnitId: unitAId },
			{ view: "month", date: "2026-01-10", search: "" },
		);
		const read = output.events.find((entry) => entry.id === eventId);
		expect(read?.colorOverride).toBe("banana");
	});
});
