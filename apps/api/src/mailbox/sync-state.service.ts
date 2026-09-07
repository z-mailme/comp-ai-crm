import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
	type Prisma,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { SyncSource } from "./mailbox.constants";

export const SYNC_LEASE_MS = 300_000;

@Injectable()
export class SyncStateService {
	private readonly logger = new Logger(SyncStateService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async get(userId: string, source: SyncSource): Promise<MailboxSync | null> {
		return this.db.mailboxSync.findUnique({
			where: { userId_source: { userId, source } },
		});
	}

	async listForUser(
		userId: string,
		sources?: readonly SyncSource[],
	): Promise<MailboxSync[]> {
		const where: Prisma.MailboxSyncWhereInput = { userId };
		if (sources) where.source = { in: [...sources] };

		return this.db.mailboxSync.findMany({ where });
	}

	async due(now: Date): Promise<MailboxSync[]> {
		return this.db.mailboxSync.findMany({
			where: dueWhere(now),
			orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
		});
	}

	async claim(row: MailboxSync, now: Date): Promise<boolean> {
		const { count } = await this.db.mailboxSync.updateMany({
			where: { id: row.id, updatedAt: row.updatedAt, ...dueWhere(now) },
			data: {
				status: GoogleSyncStatus.RUNNING,
				retryAfter: new Date(now.getTime() + SYNC_LEASE_MS),
			},
		});

		return count === 1;
	}

	async release(id: string): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { id },
			data: { retryAfter: null },
		});
	}

	async ensure(
		userId: string,
		source: SyncSource,
		options: { autoCreate: boolean; businessUnitId?: string | null },
	): Promise<MailboxSync> {
		return this.db.mailboxSync.upsert({
			where: { userId_source: { userId, source } },
			create: {
				userId,
				source,
				status: GoogleSyncStatus.IDLE,
				autoCreate: options.autoCreate,
				businessUnitId: options.businessUnitId ?? null,
			},
			update: {
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
				...(options.businessUnitId === undefined
					? {}
					: { businessUnitId: options.businessUnitId }),
			},
		});
	}

	async markRunning(id: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: { status: GoogleSyncStatus.RUNNING, lastError: null },
		});
	}

	async settle(
		id: string,
		update: {
			cursor?: string | null;
			status: GoogleSyncStatus;
			initialBackfilledAt?: Date | null;
			backfillPageToken?: string | null;
			backfillStartedAt?: Date | null;
			backfillWindowStart?: Date | null;
			backfillWindowEnd?: Date | null;
		},
	): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				...update,
				lastSyncedAt: new Date(),
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async markBackfillStarted(
		id: string,
		input: { startedAt: Date; windowStart: Date; windowEnd: Date },
	): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				backfillStartedAt: input.startedAt,
				backfillWindowStart: input.windowStart,
				backfillWindowEnd: input.windowEnd,
			},
		});
	}

	async checkpointBackfill(id: string, pageToken: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: { backfillPageToken: pageToken },
		});
	}

	async assignBusinessUnitIfMissing(
		id: string,
		businessUnitId: string,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { id, businessUnitId: null },
			data: { businessUnitId },
		});
	}

	async clearCursor(id: string, reason: string): Promise<void> {
		this.logger.warn({
			message: "Sync cursor invalidated — resuming from now",
			syncId: id,
			reason,
		});

		await this.db.mailboxSync.update({
			where: { id },
			data: {
				cursor: null,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async resetCalendarBackfill(id: string, reason: string): Promise<void> {
		this.logger.warn({
			message: "Calendar cursor invalidated; initial backfill will restart",
			syncId: id,
			reason,
		});

		await this.db.mailboxSync.update({
			where: { id },
			data: {
				cursor: null,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
				initialBackfilledAt: null,
				backfillPageToken: null,
				backfillStartedAt: null,
				backfillWindowStart: null,
				backfillWindowEnd: null,
			},
		});
	}

	async markNeedsReconnect(id: string, reason: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.NEEDS_RECONNECT,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async markRateLimited(id: string, retryAfterMs: number): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.IDLE,
				retryAfter: new Date(Date.now() + retryAfterMs),
			},
		});
	}

	async markFailed(id: string, reason: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.FAILED,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async setAutoCreate(
		userId: string,
		source: SyncSource,
		enabled: boolean,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: { autoCreate: enabled },
		});
	}

	async reindexCalendar(
		userId: string,
		businessUnitId: string | null,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source: "calendar" },
			data: {
				businessUnitId,
				cursor: null,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
				initialBackfilledAt: null,
				backfillPageToken: null,
				backfillStartedAt: null,
				backfillWindowStart: null,
				backfillWindowEnd: null,
			},
		});
	}

	async remove(userId: string, source?: SyncSource): Promise<void> {
		const where: Prisma.MailboxSyncWhereInput = { userId };
		if (source) where.source = source;

		await this.db.mailboxSync.deleteMany({ where });
	}
}

function dueWhere(now: Date) {
	return {
		status: { notIn: [GoogleSyncStatus.NEEDS_RECONNECT] },
		OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
	};
}
