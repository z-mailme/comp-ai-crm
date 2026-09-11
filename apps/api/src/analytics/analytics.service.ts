import {
	ANALYTICS_SCOPE,
	GOOGLE_PROVIDER_ID,
	isGoogleConfigured,
} from "@crm/auth";
import type { Db } from "@crm/db";
import { readGaProperty, writeGaProperty } from "@crm/db/settings";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
	BadGatewayException,
	BadRequestException,
	Inject,
	Injectable,
	Logger,
} from "@nestjs/common";
import type { Cache } from "cache-manager";
import { InjectDatabase } from "../database/database.constants";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	type GaReportRequest,
	type GaReportResponse,
	type GaReportRow,
	GoogleAnalyticsClient,
} from "./analytics.client";
import { GOOGLE_ANALYTICS } from "./analytics.constants";
import type {
	GaPropertiesOutput,
	GaReportOkOutput,
	GaReportOutput,
	GaStatusOutput,
	SetGaPropertyInput,
} from "./analytics.contracts";

const SUMMARY_METRICS = [
	"totalUsers",
	"activeUsers",
	"sessions",
	"engagedSessions",
	"engagementRate",
	"screenPageViews",
	"eventCount",
	"keyEvents",
	"userEngagementDuration",
] as const;

@Injectable()
export class GoogleAnalyticsService {
	private readonly logger = new Logger(GoogleAnalyticsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly ga: GoogleAnalyticsClient,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async status(userId: string): Promise<GaStatusOutput> {
		const configured = isGoogleConfigured();
		if (!configured) {
			return {
				configured,
				linked: false,
				scopeGranted: false,
				property: null,
			};
		}

		const [accounts, granted, property] = await Promise.all([
			this.tokens.signInAccounts(userId),
			this.tokens.grantedScopes(userId, GOOGLE_PROVIDER_ID),
			readGaProperty(this.db),
		]);

		return {
			configured,
			linked: accounts.some(
				(account) => account.providerId === GOOGLE_PROVIDER_ID,
			),
			scopeGranted: granted.has(ANALYTICS_SCOPE),
			property,
		};
	}

	async properties(userId: string): Promise<GaPropertiesOutput> {
		const token = await this.readyToken(userId);
		const result = await this.ga.listProperties(token);
		if (result.outcome !== "ok") {
			throw new BadGatewayException(result.reason);
		}
		return { properties: result.data };
	}

	async setProperty(
		userId: string,
		input: SetGaPropertyInput,
	): Promise<GaStatusOutput> {
		const status = await this.status(userId);
		if (!status.scopeGranted) {
			throw new BadRequestException(
				"Grant Google Analytics access before choosing a property.",
			);
		}

		const property = input.property;
		await writeGaProperty(
			this.db,
			property ? { id: property.id, name: property.name ?? null } : null,
		);

		this.logger.log({
			message: "Google Analytics property changed",
			userId,
			propertyId: property?.id ?? null,
		});

		return this.status(userId);
	}

	async report(
		userId: string,
		input: { days: 7 | 28 | 90 },
	): Promise<GaReportOutput> {
		const status = await this.status(userId);
		if (!status.configured) return { state: "unavailable" };
		if (!status.linked) return { state: "disconnected" };
		if (!status.scopeGranted) return { state: "permission-required" };

		const property = status.property;
		if (!property) return { state: "no-property" };

		const days = input.days;
		const cacheKey = `ga:report:${property.id}:${days}`;
		const cached = await this.cache.get<GaReportOkOutput>(cacheKey);
		if (cached) return cached;

		const token = await this.tokens.accessTokenForScope(
			userId,
			GOOGLE_PROVIDER_ID,
			ANALYTICS_SCOPE,
			"Google Analytics",
		);
		if (token.outcome === "not-connected") {
			return { state: "permission-required" };
		}
		if (token.outcome !== "ok") {
			throw new BadGatewayException(token.reason);
		}

		const range = { startDate: `${days - 1}daysAgo`, endDate: "today" };
		const run = (
			request: Omit<GaReportRequest, "startDate" | "endDate">,
		): Promise<MailboxResult<GaReportResponse>> =>
			this.ga.runReport(token.accessToken, property.id, {
				...range,
				...request,
			});

		const [summary, daily, sources, pages, devices, countries] =
			await Promise.all([
				run({ metrics: [...SUMMARY_METRICS] }),
				run({
					metrics: ["totalUsers", "sessions", "screenPageViews"],
					dimensions: ["date"],
					orderByDimension: "date",
					limit: GOOGLE_ANALYTICS.dailyRowLimit,
				}),
				run({
					metrics: ["totalUsers", "sessions"],
					dimensions: ["sessionSource", "sessionMedium"],
					orderByMetric: "sessions",
					orderDesc: true,
					limit: GOOGLE_ANALYTICS.breakdownRowLimit,
				}),
				run({
					metrics: ["screenPageViews", "totalUsers"],
					dimensions: ["pagePath"],
					orderByMetric: "screenPageViews",
					orderDesc: true,
					limit: GOOGLE_ANALYTICS.breakdownRowLimit,
				}),
				run({
					metrics: ["totalUsers"],
					dimensions: ["deviceCategory"],
					orderByMetric: "totalUsers",
					orderDesc: true,
					limit: GOOGLE_ANALYTICS.breakdownRowLimit,
				}),
				run({
					metrics: ["totalUsers"],
					dimensions: ["country"],
					orderByMetric: "totalUsers",
					orderDesc: true,
					limit: GOOGLE_ANALYTICS.breakdownRowLimit,
				}),
			]);

		const data = [
			this.unwrap(summary),
			this.unwrap(daily),
			this.unwrap(sources),
			this.unwrap(pages),
			this.unwrap(devices),
			this.unwrap(countries),
		];
		if (data.some((entry) => entry === "unauthorized")) {
			return { state: "permission-required" };
		}

		const [
			summaryData,
			dailyData,
			sourcesData,
			pagesData,
			devicesData,
			countriesData,
		] = data as [
			GaReportResponse,
			GaReportResponse,
			GaReportResponse,
			GaReportResponse,
			GaReportResponse,
			GaReportResponse,
		];

		const report: GaReportOkOutput = {
			state: "ok",
			windowDays: days,
			property,
			generatedAt: new Date().toISOString(),
			summary: mapSummary(summaryData),
			daily: dailyData.rows.map((row) => ({
				date: gaDate(dimension(row, 0)),
				users: metric(row, 0, "totalUsers"),
				sessions: metric(row, 1, "sessions"),
				views: metric(row, 2, "screenPageViews"),
			})),
			sources: sourcesData.rows.map((row) => ({
				source: dimension(row, 0),
				medium: dimension(row, 1),
				users: metric(row, 0, "totalUsers"),
				sessions: metric(row, 1, "sessions"),
			})),
			pages: pagesData.rows.map((row) => ({
				path: dimension(row, 0),
				views: metric(row, 0, "screenPageViews"),
				users: metric(row, 1, "totalUsers"),
			})),
			devices: devicesData.rows.map((row) => ({
				category: dimension(row, 0),
				users: metric(row, 0, "totalUsers"),
			})),
			countries: countriesData.rows.map((row) => ({
				country: dimension(row, 0),
				users: metric(row, 0, "totalUsers"),
			})),
		};

		await this.cache.set(cacheKey, report, GOOGLE_ANALYTICS.reportCacheTtlMs);

		return report;
	}

	private unwrap(
		result: MailboxResult<GaReportResponse>,
	): GaReportResponse | "unauthorized" {
		if (result.outcome === "unauthorized") return "unauthorized";
		if (result.outcome !== "ok") {
			throw new BadGatewayException(result.reason);
		}
		return result.data;
	}

	private async readyToken(userId: string): Promise<string> {
		const status = await this.status(userId);
		if (!status.configured) {
			throw new BadRequestException("Google sign-in is not configured.");
		}
		if (!status.scopeGranted) {
			throw new BadRequestException(
				"Grant Google Analytics access before listing properties.",
			);
		}

		const token = await this.tokens.accessTokenForScope(
			userId,
			GOOGLE_PROVIDER_ID,
			ANALYTICS_SCOPE,
			"Google Analytics",
		);
		if (token.outcome !== "ok") {
			throw new BadGatewayException(token.reason);
		}
		return token.accessToken;
	}
}

function dimension(row: GaReportRow, index: number): string {
	return row.dimensionValues[index]?.value ?? "";
}

function metric(row: GaReportRow, index: number, name: string): number {
	const raw = row.metricValues[index]?.value;
	const parsed = raw === undefined ? Number.NaN : Number(raw);
	if (!Number.isFinite(parsed)) {
		throw new BadGatewayException(
			`Google Analytics returned a non-numeric ${name}.`,
		);
	}
	return parsed;
}

function gaDate(value: string): string {
	const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
	if (!match) {
		throw new BadGatewayException(
			"Google Analytics returned an unexpected date.",
		);
	}
	return `${match[1]}-${match[2]}-${match[3]}`;
}

function mapSummary(report: GaReportResponse): GaReportOkOutput["summary"] {
	const row = report.rows[0];
	if (!row) {
		return {
			users: 0,
			activeUsers: 0,
			sessions: 0,
			engagedSessions: 0,
			engagementRate: null,
			views: 0,
			eventCount: 0,
			keyEvents: 0,
			avgEngagementTimeSeconds: null,
		};
	}

	const sessions = metric(row, 2, "sessions");
	const engagementSeconds = metric(row, 8, "userEngagementDuration");

	return {
		users: metric(row, 0, "totalUsers"),
		activeUsers: metric(row, 1, "activeUsers"),
		sessions,
		engagedSessions: metric(row, 3, "engagedSessions"),
		engagementRate: metric(row, 4, "engagementRate"),
		views: metric(row, 5, "screenPageViews"),
		eventCount: metric(row, 6, "eventCount"),
		keyEvents: metric(row, 7, "keyEvents"),
		avgEngagementTimeSeconds:
			sessions > 0 ? Math.round(engagementSeconds / sessions) : null,
	};
}
