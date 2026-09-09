import { type Db, type DealStage } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type { BriefDailyOutput, BriefExceptionOutput } from "./brief.contracts";

const popData = z
	.object({
		amount: z.number().nullable().catch(null),
	})
	.catch({ amount: null });

const DAY_MS = 86_400_000;
const STALE_QUOTE_DAYS = 3;

const QUOTE_STAGES: DealStage[] = ["CONTRACT_SENT", "DECISION_MAKER_BOUGHT_IN"];

@Injectable()
export class BriefService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async daily(): Promise<BriefDailyOutput> {
		const now = new Date();
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY_MS);
		const yesterday = new Date(now.getTime() - DAY_MS);
		const twoWeeksAhead = new Date(now.getTime() + 14 * DAY_MS);

		const [
			eventsToday,
			newEnquiries,
			quotesToFollowUp,
			depositsOutstanding,
			popReceived,
			bookingsMissingDetails,
			unreadMessages,
		] = await Promise.all([
			this.db.calendarEvent.count({
				where: {
					startsAt: { gte: todayStart, lt: tomorrowEnd },
					status: { not: "cancelled" },
				},
			}),
			this.db.communicationMessage.count({
				where: {
					direction: "INBOUND",
					sentAt: { gte: yesterday },
				},
			}),
			this.db.deal.count({
				where: {
					archivedAt: null,
					stage: { in: QUOTE_STAGES },
					lastActivityAt: {
						lt: new Date(now.getTime() - STALE_QUOTE_DAYS * DAY_MS),
					},
				},
			}),
			this.db.deal.count({
				where: {
					archivedAt: null,
					depositAmount: { gt: 0 },
					bookings: {
						some: {
							status: { notIn: ["CANCELLED", "COMPLETED"] },
							eventDate: { gte: todayStart },
						},
					},
				},
			}),
			this.db.businessEvent.count({
				where: { type: "POP_RECEIVED", occurredAt: { gte: yesterday } },
			}),
			this.db.booking.count({
				where: {
					status: "PROVISIONAL",
					eventDate: { gte: todayStart, lte: twoWeeksAhead },
				},
			}),
			this.db.conversation.aggregate({
				_sum: { unreadCount: true },
			}),
		]);

		return {
			generatedAt: now.toISOString(),
			eventsToday,
			newEnquiries,
			quotesToFollowUp,
			depositsOutstanding,
			popReceived,
			bookingsMissingDetails,
			unreadMessages: unreadMessages._sum.unreadCount ?? 0,
		};
	}

	async exceptions(): Promise<{ exceptions: BriefExceptionOutput[] }> {
		const now = new Date();
		const dayAgo = new Date(now.getTime() - DAY_MS);
		const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);
		const tomorrowEnd = new Date(now);
		tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
		tomorrowEnd.setHours(0, 0, 0, 0);

		const [unanswered, staleQuotes, provisionalSoon, pops] = await Promise.all([
			this.db.conversation.findMany({
				where: {
					unreadCount: { gt: 0 },
					lastMessageAt: { lt: dayAgo },
				},
				orderBy: { lastMessageAt: "asc" },
				take: 20,
				select: {
					id: true,
					subject: true,
					channel: true,
					lastMessageAt: true,
					contactId: true,
					companyId: true,
					contact: { select: { firstName: true, lastName: true } },
					company: { select: { name: true } },
				},
			}),
			this.db.deal.findMany({
				where: {
					archivedAt: null,
					stage: { in: QUOTE_STAGES },
					lastActivityAt: {
						lt: new Date(now.getTime() - STALE_QUOTE_DAYS * DAY_MS),
					},
				},
				orderBy: { lastActivityAt: "asc" },
				take: 20,
				select: {
					id: true,
					name: true,
					stage: true,
					lastActivityAt: true,
					companyId: true,
					company: { select: { name: true } },
				},
			}),
			this.db.booking.findMany({
				where: {
					status: "PROVISIONAL",
					eventDate: { gte: new Date(now), lte: tomorrowEnd },
				},
				orderBy: { eventDate: "asc" },
				take: 20,
				select: {
					id: true,
					eventDate: true,
					dealId: true,
					deal: {
						select: {
							name: true,
							companyId: true,
							company: { select: { name: true } },
						},
					},
				},
			}),
			this.db.businessEvent.findMany({
				where: {
					type: "POP_RECEIVED",
					occurredAt: { gte: twoDaysAgo },
				},
				orderBy: { occurredAt: "desc" },
				take: 20,
				select: {
					id: true,
					contactId: true,
					companyId: true,
					dealId: true,
					bookingId: true,
					conversationId: true,
					data: true,
					company: { select: { name: true } },
				},
			}),
		]);

		const exceptions: BriefExceptionOutput[] = [];

		for (const conversation of unanswered) {
			const ageMs = conversation.lastMessageAt
				? now.getTime() - conversation.lastMessageAt.getTime()
				: 3 * DAY_MS;
			const name =
				[conversation.contact?.firstName, conversation.contact?.lastName]
					.filter(Boolean)
					.join(" ") ||
				conversation.company?.name ||
				"Unknown sender";

			exceptions.push({
				id: `unanswered:${conversation.id}`,
				severity: ageMs > 2 * DAY_MS ? "URGENT" : "ATTENTION",
				type: "UNANSWERED_LEAD",
				title: `${name} is waiting on a reply`,
				detail: conversation.subject ?? null,
				suggestedAction: "Follow up",
				contactId: conversation.contactId,
				companyId: conversation.companyId,
				dealId: null,
				bookingId: null,
				conversationId: conversation.id,
			});
		}

		for (const deal of staleQuotes) {
			exceptions.push({
				id: `stale-quote:${deal.id}`,
				severity: "ATTENTION",
				type: "STALE_QUOTE",
				title: `Quote for ${deal.company.name} has had no answer in ${STALE_QUOTE_DAYS} days`,
				detail: deal.name,
				suggestedAction: "Follow up",
				contactId: null,
				companyId: deal.companyId,
				dealId: deal.id,
				bookingId: null,
				conversationId: null,
			});
		}

		for (const booking of provisionalSoon) {
			exceptions.push({
				id: `incomplete-booking:${booking.id}`,
				severity: "URGENT",
				type: "BOOKING_MISSING_DETAILS",
				title: `${booking.deal.name} is provisional and happens within two days`,
				detail: `Event date ${booking.eventDate.toISOString().slice(0, 10)}`,
				suggestedAction: "Confirm event details",
				contactId: null,
				companyId: booking.deal.companyId,
				dealId: booking.dealId,
				bookingId: booking.id,
				conversationId: null,
			});
		}

		for (const pop of pops) {
			const data = popData.parse(pop.data);
			exceptions.push({
				id: `pop-review:${pop.id}`,
				severity: "ATTENTION",
				type: "POP_RECEIVED",
				title: `Proof of payment from ${pop.company?.name ?? "a customer"} needs review`,
				detail:
					data.amount !== null
						? `R${data.amount.toLocaleString("en-ZA")} — payment is not confirmed until it reconciles`
						: "Payment is not confirmed until it reconciles",
				suggestedAction: "Review POP",
				contactId: pop.contactId,
				companyId: pop.companyId,
				dealId: pop.dealId,
				bookingId: pop.bookingId,
				conversationId: pop.conversationId,
			});
		}

		const rank = { URGENT: 0, ATTENTION: 1, INFO: 2 } as const;
		exceptions.sort((a, b) => rank[a.severity] - rank[b.severity]);

		return { exceptions };
	}
}
