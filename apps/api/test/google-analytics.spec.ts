import { describe, expect, it } from "bun:test";
import {
	ANALYTICS_SCOPE,
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	hasSyncScopes,
	parseScopes,
	REQUIRED_SCOPES,
	SYNC_SCOPES,
} from "@crm/auth";
import { db } from "@crm/db";
import { readGaProperty, SETTINGS_ID } from "@crm/db/settings";
import { BadGatewayException, BadRequestException } from "@nestjs/common";
import type { Cache } from "cache-manager";
import type {
	GaProperty,
	GaReportRequest,
	GaReportResponse,
} from "../src/analytics/analytics.client";
import { GoogleAnalyticsClient } from "../src/analytics/analytics.client";
import {
	gaPropertyId,
	setGaPropertyInput,
} from "../src/analytics/analytics.contracts";
import { GoogleAnalyticsService } from "../src/analytics/analytics.service";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";

const GA_SCOPE_SET = `openid email profile ${GMAIL_SCOPE} ${CALENDAR_SCOPE} ${ANALYTICS_SCOPE}`;

class FakeAnalyticsClient {
	calls: GaReportRequest[] = [];
	responses: MailboxResult<GaReportResponse>[] = [];
	propertyListing: MailboxResult<GaProperty[]> = { outcome: "ok", data: [] };

	async listProperties(): Promise<MailboxResult<GaProperty[]>> {
		return this.propertyListing;
	}

	async runReport(
		_accessToken: string,
		_propertyId: string,
		request: GaReportRequest,
	): Promise<MailboxResult<GaReportResponse>> {
		const index = this.calls.length;
		this.calls.push(request);
		return (
			this.responses[index] ?? {
				outcome: "ok",
				data: { dimensionHeaders: [], metricHeaders: [], rows: [] },
			}
		);
	}
}

function fakeCache(): Cache & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>();
	return {
		store,
		get: async <T>(key: string) => store.get(key) as T | undefined,
		set: async <T>(key: string, value: T) => {
			store.set(key, value);
		},
		del: async (key: string) => {
			store.delete(key);
		},
	} as unknown as Cache & { store: Map<string, unknown> };
}

function fakeTokens(scope: string | null): MailboxTokenService {
	const granted = parseScopes(scope);
	return {
		signInAccounts: async () => [{ providerId: "google", scope }],
		grantedScopes: async () => granted,
		accessTokenForScope: async () => ({
			outcome: "ok",
			accessToken: "ga-token",
		}),
	} as unknown as MailboxTokenService;
}

function serviceWith(
	tokens: MailboxTokenService,
	client: FakeAnalyticsClient,
	cache = fakeCache(),
) {
	return {
		service: new GoogleAnalyticsService(
			db,
			tokens,
			client as unknown as GoogleAnalyticsClient,
			cache,
		),
		cache,
	};
}

function okReport(
	rows: GaReportResponse["rows"],
): MailboxResult<GaReportResponse> {
	return {
		outcome: "ok",
		data: { dimensionHeaders: [], metricHeaders: [], rows },
	};
}

async function setStoredProperty(
	property: { id: string; name: string | null } | null,
): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			id: SETTINGS_ID,
			gaPropertyId: property?.id ?? null,
			gaPropertyName: property?.name ?? null,
		},
		update: {
			gaPropertyId: property?.id ?? null,
			gaPropertyName: property?.name ?? null,
		},
	});
}

describe("google analytics scope composition", () => {
	it("keeps the analytics scope out of the sync scopes", () => {
		expect(SYNC_SCOPES).not.toContain(ANALYTICS_SCOPE);
		expect(REQUIRED_SCOPES).not.toContain(ANALYTICS_SCOPE);
	});

	it("does not wall existing Google users behind the analytics scope", () => {
		const mailboxOnly = `openid email profile ${GMAIL_SCOPE} ${CALENDAR_SCOPE}`;
		expect(hasSyncScopes("google", mailboxOnly)).toBe(true);
	});

	it("parses the analytics scope from a stored grant", () => {
		expect(parseScopes(GA_SCOPE_SET).has(ANALYTICS_SCOPE)).toBe(true);
	});
});

describe("gaPropertyId", () => {
	it("accepts a bare numeric id", () => {
		expect(gaPropertyId.parse("123456789")).toBe("123456789");
	});

	it("strips the resource prefix", () => {
		expect(gaPropertyId.parse("properties/123456789")).toBe("123456789");
	});

	it("rejects a non-numeric id", () => {
		expect(gaPropertyId.safeParse("not-a-property").success).toBe(false);
	});
});

describe("google analytics property selection", () => {
	it("stores and clears the selected property", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty(null);
		const before = await service.status("ga-user");
		expect(before.property).toBeNull();

		const after = await service.setProperty(
			"ga-user",
			setGaPropertyInput.parse({
				property: { id: "properties/123456789", name: "Event Props" },
			}),
		);
		expect(after.property).toEqual({ id: "123456789", name: "Event Props" });
		expect(await readGaProperty(db)).toEqual({
			id: "123456789",
			name: "Event Props",
		});

		const cleared = await service.setProperty("ga-user", { property: null });
		expect(cleared.property).toBeNull();
	});

	it("refuses property selection without the analytics grant", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(
			fakeTokens(`openid email profile ${GMAIL_SCOPE} ${CALENDAR_SCOPE}`),
			client,
		);

		let caught: unknown;
		try {
			await service.setProperty("ga-user", {
				property: { id: "123456789" },
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(BadRequestException);
	});
});

describe("google analytics report states", () => {
	it("reports permission-required without the analytics scope", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(
			fakeTokens(`openid email profile ${GMAIL_SCOPE} ${CALENDAR_SCOPE}`),
			client,
		);

		await setStoredProperty({ id: "123456789", name: null });
		const report = await service.report("ga-user", { days: 28 });
		expect(report.state).toBe("permission-required");
		expect(client.calls.length).toBe(0);
	});

	it("reports no-property when nothing is selected", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty(null);
		const report = await service.report("ga-user", { days: 28 });
		expect(report.state).toBe("no-property");
		expect(client.calls.length).toBe(0);
	});
});

describe("google analytics report mapping", () => {
	const summaryRow = {
		dimensionValues: [],
		metricValues: [
			{ value: "1234" },
			{ value: "1000" },
			{ value: "20" },
			{ value: "12" },
			{ value: "0.6341" },
			{ value: "5678" },
			{ value: "910" },
			{ value: "11" },
			{ value: "3600" },
		],
	};

	function mappedClient(): FakeAnalyticsClient {
		const client = new FakeAnalyticsClient();
		client.responses = [
			okReport([summaryRow]),
			okReport([
				{
					dimensionValues: [{ value: "20260901" }],
					metricValues: [{ value: "40" }, { value: "44" }, { value: "60" }],
				},
			]),
			okReport([
				{
					dimensionValues: [{ value: "google" }, { value: "organic" }],
					metricValues: [{ value: "30" }, { value: "33" }],
				},
			]),
			okReport([
				{
					dimensionValues: [{ value: "/pricing" }],
					metricValues: [{ value: "55" }, { value: "38" }],
				},
			]),
			okReport([
				{
					dimensionValues: [{ value: "mobile" }],
					metricValues: [{ value: "25" }],
				},
			]),
			okReport([
				{
					dimensionValues: [{ value: "South Africa" }],
					metricValues: [{ value: "70" }],
				},
			]),
		];
		return client;
	}

	it("maps a full report", async () => {
		const client = mappedClient();
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: "Event Props" });
		const report = await service.report("ga-user", { days: 7 });

		expect(report.state).toBe("ok");
		if (report.state !== "ok") return;
		expect(report.windowDays).toBe(7);
		expect(report.summary.users).toBe(1234);
		expect(report.summary.activeUsers).toBe(1000);
		expect(report.summary.sessions).toBe(20);
		expect(report.summary.engagedSessions).toBe(12);
		expect(report.summary.engagementRate).toBeCloseTo(0.6341);
		expect(report.summary.views).toBe(5678);
		expect(report.summary.eventCount).toBe(910);
		expect(report.summary.keyEvents).toBe(11);
		expect(report.summary.avgEngagementTimeSeconds).toBe(180);
		expect(report.daily).toEqual([
			{ date: "2026-09-01", users: 40, sessions: 44, views: 60 },
		]);
		expect(report.sources).toEqual([
			{ source: "google", medium: "organic", users: 30, sessions: 33 },
		]);
		expect(report.pages).toEqual([{ path: "/pricing", views: 55, users: 38 }]);
		expect(report.devices).toEqual([{ category: "mobile", users: 25 }]);
		expect(report.countries).toEqual([{ country: "South Africa", users: 70 }]);
	});

	it("maps an empty report to zeros without inventing data", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: null });
		const report = await service.report("ga-user", { days: 28 });

		expect(report.state).toBe("ok");
		if (report.state !== "ok") return;
		expect(report.summary.users).toBe(0);
		expect(report.summary.engagementRate).toBeNull();
		expect(report.summary.avgEngagementTimeSeconds).toBeNull();
		expect(report.daily).toEqual([]);
		expect(report.sources).toEqual([]);
	});

	it("throws when Google returns an error", async () => {
		const client = new FakeAnalyticsClient();
		client.responses = [
			{
				outcome: "failed",
				reason: "GA4 API is not enabled.",
				retryable: false,
			},
		];
		const { service, cache } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: null });
		let caught: unknown;
		try {
			await service.report("ga-user", { days: 28 });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(BadGatewayException);
		expect(cache.store.size).toBe(0);
	});

	it("throws on malformed metric values", async () => {
		const client = new FakeAnalyticsClient();
		client.responses = [
			okReport([
				{
					dimensionValues: [],
					metricValues: [{ value: "not-a-number" }],
				},
			]),
		];
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: null });
		let caught: unknown;
		try {
			await service.report("ga-user", { days: 28 });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(BadGatewayException);
	});

	it("treats an unauthorized report as permission-required", async () => {
		const client = new FakeAnalyticsClient();
		client.responses = [{ outcome: "unauthorized", reason: "token revoked" }];
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: null });
		const report = await service.report("ga-user", { days: 28 });
		expect(report.state).toBe("permission-required");
	});
});

describe("google analytics report caching", () => {
	it("serves a repeated report from cache within the TTL", async () => {
		const client = new FakeAnalyticsClient();
		const { service } = serviceWith(fakeTokens(GA_SCOPE_SET), client);

		await setStoredProperty({ id: "123456789", name: null });
		await service.report("ga-user", { days: 28 });
		await service.report("ga-user", { days: 28 });
		expect(client.calls.length).toBe(6);

		await service.report("ga-user", { days: 90 });
		expect(client.calls.length).toBe(12);
	});
});
