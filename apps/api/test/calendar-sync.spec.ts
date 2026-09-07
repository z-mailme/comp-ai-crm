import { afterAll, describe, expect, it } from "bun:test";
import {
	BusinessUnitStatus,
	CommunicationChannel,
	CustomerIdentityKind,
	CustomerIdentityStatus,
	db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { BusinessOsService } from "../src/business-os/business-os.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
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

type ListEventsCall = EventsQuery;

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID();
const marker = `calendar-sync-${suffix}`;
const userId = `calendar-user-${marker}`;
const userEmail = `rep-${marker}@example.test`;
const unitAId = `calendar-unit-a-${marker}`;
const unitBId = `calendar-unit-b-${marker}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	meetingSoon: async () => undefined,
} as unknown as AgentTriggerService;

class FakeCalendar {
	readonly calls: ListEventsCall[] = [];
	private readonly pages = new Map<string, EventsPage>();

	setPage(pageToken: string | undefined, page: EventsPage): void {
		this.pages.set(pageToken ?? "", page);
	}

	async listEvents(
		_accessToken: string,
		query: EventsQuery,
	): Promise<{ outcome: "ok"; data: EventsPage }> {
		this.calls.push(query);
		return { outcome: "ok", data: this.pages.get(query.pageToken ?? "") ?? {} };
	}
}

type Kit = {
	calendar: FakeCalendar;
	row: MailboxSync;
	service: CalendarSyncService;
	state: SyncStateService;
	businessOs: BusinessOsService;
};

async function kit(
	_name: string,
	options: Partial<MailboxSync> = {},
): Promise<Kit> {
	await seedWorkspace();
	await resetSyncArtifacts();
	const row = await db.mailboxSync.create({
		data: {
			userId,
			source: "calendar",
			status: GoogleSyncStatus.IDLE,
			cursor: options.cursor ?? "sync-start",
			autoCreate: options.autoCreate ?? false,
			businessUnitId: options.businessUnitId ?? unitAId,
			initialBackfilledAt:
				options.initialBackfilledAt === undefined
					? new Date("2026-01-01T00:00:00.000Z")
					: options.initialBackfilledAt,
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
		state,
		businessOs: new BusinessOsService(db),
	};
}

function event(input: {
	id: string;
	email?: string;
	start?: string;
	title?: string;
	status?: string;
	recurringEventId?: string;
	originalStart?: string;
}): GoogleEvent {
	const start = input.start ?? "2026-01-10T10:00:00.000Z";
	const attendee = input.email
		? [
				{
					email: input.email,
					displayName: "Customer",
					responseStatus: "accepted",
				},
			]
		: [];

	return {
		id: input.id,
		iCalUID: `${input.id}@google.test`,
		status: input.status ?? "confirmed",
		summary: input.title ?? `Meeting ${input.id}`,
		start: { dateTime: start },
		end: {
			dateTime: new Date(new Date(start).getTime() + 1_800_000).toISOString(),
		},
		originalStartTime: {
			dateTime: input.originalStart ?? start,
		},
		recurringEventId: input.recurringEventId,
		organizer: { email: userEmail, self: true },
		attendees: attendee,
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
		create: { id: userId, name: "Calendar User", email: userEmail },
		update: {},
	});
	await db.member.upsert({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		create: {
			id: `calendar-member-${marker}`,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
		update: {},
	});
	for (const [id, name] of [
		[unitAId, "Unit A"],
		[unitBId, "Unit B"],
	] as const) {
		await db.businessUnit.upsert({
			where: { id },
			create: {
				id,
				name: `${name} ${marker}`,
				slug: `${id}`,
				status: BusinessUnitStatus.ACTIVE,
				ownerId: userId,
			},
			update: {},
		});
	}
}

async function seedContact(email: string, unitId = unitAId) {
	const company = await db.company.create({
		data: { name: `Company ${email}`, domain: email.split("@")[1] ?? null },
		select: { id: true },
	});
	const contact = await db.contact.create({
		data: {
			firstName: "Calendar",
			lastName: "Buyer",
			email,
			companyId: company.id,
		},
		select: { id: true, companyId: true },
	});
	await db.customerIdentity.createMany({
		data: [
			{
				businessUnitId: unitId,
				contactId: contact.id,
				kind: CustomerIdentityKind.EMAIL,
				channel: CommunicationChannel.EMAIL,
				value: email,
				status: CustomerIdentityStatus.VERIFIED,
			},
		],
	});

	return { company, contact };
}

async function resetSyncArtifacts() {
	await db.activity.deleteMany({
		where: {
			OR: [
				{ createdById: userId },
				{ calendarEvent: { iCalUid: { contains: marker } } },
			],
		},
	});
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { contains: marker } },
	});
	await db.mailboxSync.deleteMany({ where: { userId } });
}

async function clean() {
	await db.activity.deleteMany({
		where: { calendarEvent: { iCalUid: { contains: marker } } },
	});
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { contains: marker } },
	});
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.customerIdentity.deleteMany({
		where: {
			OR: [
				{ value: { contains: marker } },
				{ contact: { email: { contains: marker } } },
				{ company: { name: { contains: marker } } },
			],
		},
	});
	await db.contact.deleteMany({
		where: { email: { contains: marker } },
	});
	await db.company.deleteMany({
		where: {
			OR: [{ name: { contains: marker } }, { domain: { contains: marker } }],
		},
	});
	await db.businessUnit.deleteMany({
		where: { id: { in: [unitAId, unitBId] } },
	});
	await db.member.deleteMany({ where: { userId } });
	await db.account.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

afterAll(async () => {
	await clean();
});

describe("CalendarSyncService persistence", () => {
	it("stores an event with no attendees and no CRM match", async () => {
		const setup = await kit("no-attendees");
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-no-attendees` })],
			nextSyncToken: "sync-next",
		});

		const outcome = await setup.service.sync(setup.row);
		const stored = await db.calendarEvent.findFirst({
			where: { iCalUid: `${marker}-no-attendees@google.test` },
			select: {
				businessUnitId: true,
				companyId: true,
				contactId: true,
				id: true,
				attendees: true,
			},
		});

		expect(outcome.eventsWritten).toBe(1);
		if (!stored) throw new Error("Calendar event was not stored.");
		expect(stored).toMatchObject({
			businessUnitId: unitAId,
			companyId: null,
			contactId: null,
			attendees: [],
		});
		expect(
			await db.activity.count({ where: { calendarEventId: stored.id } }),
		).toBe(0);
	});

	it("stores unknown attendees without creating CRM records when autoCreate is false", async () => {
		const setup = await kit("unknown-attendee", { autoCreate: false });
		const email = `unknown-${marker}@customer.test`;
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-unknown`, email })],
			nextSyncToken: "sync-next",
		});

		await setup.service.sync(setup.row);
		const stored = await db.calendarEvent.findFirstOrThrow({
			where: { iCalUid: `${marker}-unknown@google.test` },
			select: {
				companyId: true,
				contactId: true,
				attendees: { select: { email: true, contactId: true } },
			},
		});

		expect(stored.companyId).toBeNull();
		expect(stored.contactId).toBeNull();
		expect(stored.attendees).toEqual([{ email, contactId: null }]);
		expect(await db.contact.count({ where: { email } })).toBe(0);
	});

	it("links a matched event after storage", async () => {
		const email = `matched-${marker}@buyer.test`;
		const { company, contact } = await seedContact(email);
		const setup = await kit("matched");
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-matched`, email })],
			nextSyncToken: "sync-next",
		});

		await setup.service.sync(setup.row);
		const stored = await db.calendarEvent.findFirstOrThrow({
			where: { iCalUid: `${marker}-matched@google.test` },
			select: { businessUnitId: true, companyId: true, contactId: true },
		});

		expect(stored).toEqual({
			businessUnitId: unitAId,
			companyId: company.id,
			contactId: contact.id,
		});
		expect(
			await db.activity.count({ where: { contactId: contact.id } }),
		).toBeGreaterThan(0);
	});

	it("keeps sync ownership when a matched contact belongs to another unit", async () => {
		const email = `cross-unit-${marker}@cross-buyer.test`;
		await seedContact(email, unitBId);
		const setup = await kit("cross-unit", { businessUnitId: unitAId });
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-cross-unit`, email })],
			nextSyncToken: "sync-next",
		});

		await setup.service.sync(setup.row);
		const calendar = await setup.businessOs.calendar(
			{ userId, businessUnitId: unitAId },
			{ view: "day", date: "2026-01-10", search: "" },
		);
		const hidden = await setup.businessOs.calendar(
			{ userId, businessUnitId: unitBId },
			{ view: "day", date: "2026-01-10", search: "" },
		);

		expect(calendar.events.map((row) => row.googleEventId)).toContain(
			`${marker}-cross-unit`,
		);
		expect(hidden.events.map((row) => row.googleEventId)).not.toContain(
			`${marker}-cross-unit`,
		);
	});

	it("creates CRM records only when autoCreate is true", async () => {
		const setup = await kit("autocreate", { autoCreate: true });
		const email = `new-${marker}@newco.test`;
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-autocreate`, email })],
			nextSyncToken: "sync-next",
		});

		await setup.service.sync(setup.row);

		expect(await db.contact.count({ where: { email } })).toBe(1);
		expect(
			await db.calendarEvent.count({
				where: {
					iCalUid: `${marker}-autocreate@google.test`,
					businessUnitId: unitAId,
				},
			}),
		).toBe(1);
	});
});

describe("CalendarSyncService sync state", () => {
	it("runs initial backfill before it uses a stored cursor", async () => {
		const setup = await kit("initial-backfill", {
			cursor: "stale-cursor",
			initialBackfilledAt: null,
		});
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-initial-backfill` })],
			nextSyncToken: "fresh-sync",
		});

		await setup.service.sync(setup.row);
		const row = await db.mailboxSync.findUniqueOrThrow({
			where: { id: setup.row.id },
		});

		expect(setup.calendar.calls[0]?.syncToken).toBeUndefined();
		expect(setup.calendar.calls[0]?.timeMin).toBeString();
		expect(setup.calendar.calls[0]?.timeMax).toBeString();
		expect(row.cursor).toBe("fresh-sync");
		expect(row.initialBackfilledAt).not.toBeNull();
		expect(row.backfillPageToken).toBeNull();
	});

	it("uses syncToken after initial backfill", async () => {
		const setup = await kit("incremental", {
			cursor: "sync-cursor",
			initialBackfilledAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-incremental` })],
			nextSyncToken: "sync-after",
		});

		await setup.service.sync(setup.row);

		expect(setup.calendar.calls[0]?.syncToken).toBe("sync-cursor");
		expect(setup.calendar.calls[0]?.timeMin).toBeUndefined();
		expect(setup.calendar.calls[0]?.timeMax).toBeUndefined();
	});

	it("updates a repeated recurring occurrence without duplicating it", async () => {
		const setup = await kit("recurring", {
			cursor: "sync-cursor",
			initialBackfilledAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		setup.calendar.setPage(undefined, {
			items: [
				event({
					id: `${marker}-recurring`,
					title: "First title",
					recurringEventId: "series-1",
					originalStart: "2026-01-10T10:00:00.000Z",
				}),
			],
			nextSyncToken: "sync-after",
		});
		await setup.service.sync(setup.row);
		const row = await db.mailboxSync.findUniqueOrThrow({
			where: { id: setup.row.id },
		});
		setup.calendar.setPage(undefined, {
			items: [
				event({
					id: `${marker}-recurring`,
					title: "Updated title",
					recurringEventId: "series-1",
					originalStart: "2026-01-10T10:00:00.000Z",
				}),
			],
			nextSyncToken: "sync-final",
		});

		await setup.service.sync(row);

		expect(
			await db.calendarEvent.count({
				where: { iCalUid: `${marker}-recurring@google.test` },
			}),
		).toBe(1);
		expect(
			await db.calendarEvent.findFirst({
				where: { iCalUid: `${marker}-recurring@google.test` },
				select: { title: true },
			}),
		).toEqual({ title: "Updated title" });
	});

	it("removes a cancelled event in the same business unit", async () => {
		const setup = await kit("cancelled");
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-cancelled` })],
			nextSyncToken: "sync-after-create",
		});
		await setup.service.sync(setup.row);
		const row = await db.mailboxSync.findUniqueOrThrow({
			where: { id: setup.row.id },
		});
		setup.calendar.setPage(undefined, {
			items: [event({ id: `${marker}-cancelled`, status: "cancelled" })],
			nextSyncToken: "sync-after-delete",
		});

		await setup.service.sync(row);

		expect(
			await db.calendarEvent.count({
				where: { iCalUid: `${marker}-cancelled@google.test` },
			}),
		).toBe(0);
	});

	it("reindexes Calendar without touching Gmail state", async () => {
		const setup = await kit("reindex", {
			cursor: "calendar-cursor",
			initialBackfilledAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		await db.mailboxSync.create({
			data: {
				userId,
				source: "gmail",
				status: GoogleSyncStatus.IDLE,
				cursor: "gmail-cursor",
			},
		});

		await setup.state.reindexCalendar(userId, unitBId);
		const rows = await db.mailboxSync.findMany({
			where: { userId },
			select: {
				source: true,
				cursor: true,
				businessUnitId: true,
				initialBackfilledAt: true,
			},
			orderBy: { source: "asc" },
		});

		expect(rows).toEqual([
			{
				source: "calendar",
				cursor: null,
				businessUnitId: unitBId,
				initialBackfilledAt: null,
			},
			{
				source: "gmail",
				cursor: "gmail-cursor",
				businessUnitId: null,
				initialBackfilledAt: null,
			},
		]);
	});
});
