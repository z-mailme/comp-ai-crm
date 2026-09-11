import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";
import { GOOGLE_ANALYTICS } from "./analytics.constants";

const gaPropertySummary = z.object({
	property: z.string(),
	displayName: z.string().default(""),
});

const gaAccountSummaryPage = z.object({
	accountSummaries: z
		.array(
			z.object({
				displayName: z.string().default(""),
				propertySummaries: z.array(gaPropertySummary).default([]),
			}),
		)
		.default([]),
	nextPageToken: z.string().optional(),
});

const gaCell = z.object({ value: z.string() });

const gaReportRow = z.object({
	dimensionValues: z.array(gaCell).default([]),
	metricValues: z.array(gaCell).default([]),
});

export const gaReportResponse = z.object({
	dimensionHeaders: z.array(z.object({ name: z.string() })).default([]),
	metricHeaders: z.array(z.object({ name: z.string() })).default([]),
	rows: z.array(gaReportRow).default([]),
});

export type GaReportRow = z.infer<typeof gaReportRow>;
export type GaReportResponse = z.infer<typeof gaReportResponse>;

export type GaProperty = {
	id: string;
	name: string;
	accountName: string;
};

export type GaReportRequest = {
	startDate: string;
	endDate: string;
	dimensions?: string[];
	metrics: string[];
	orderByDimension?: string;
	orderByMetric?: string;
	orderDesc?: boolean;
	limit?: number;
};

type GaOrderBy =
	| { dimension: { dimensionName: string }; desc: boolean }
	| { metric: { metricName: string }; desc: boolean };

type GaRunReportBody = {
	dateRanges: { startDate: string; endDate: string }[];
	dimensions: { name: string }[];
	metrics: { name: string }[];
	orderBys: GaOrderBy[];
	limit?: number;
};

@Injectable()
export class GoogleAnalyticsClient {
	constructor(private readonly api: MailboxApiClient) {}

	async listProperties(
		accessToken: string,
	): Promise<MailboxResult<GaProperty[]>> {
		const properties: GaProperty[] = [];
		let pageToken: string | undefined;

		for (let page = 0; page < GOOGLE_ANALYTICS.maxAccountSummaryPages; page++) {
			const result = await this.api.get<unknown>(
				`${GOOGLE_ANALYTICS.adminBaseUrl}/accountSummaries`,
				accessToken,
				{
					pageSize: GOOGLE_ANALYTICS.accountSummaryPageSize,
					pageToken,
				},
			);

			if (result.outcome !== "ok") return result;

			const parsed = gaAccountSummaryPage.safeParse(result.data);
			if (!parsed.success) {
				return {
					outcome: "failed",
					reason: "Google Analytics returned an unexpected account list.",
					retryable: false,
				};
			}

			for (const account of parsed.data.accountSummaries) {
				for (const property of account.propertySummaries) {
					const id = property.property.replace(/^properties\//, "");
					if (!/^\d+$/.test(id)) continue;
					properties.push({
						id,
						name: property.displayName || `Property ${id}`,
						accountName: account.displayName,
					});
				}
			}

			pageToken = parsed.data.nextPageToken;
			if (!pageToken) break;
		}

		return { outcome: "ok", data: properties };
	}

	async runReport(
		accessToken: string,
		propertyId: string,
		request: GaReportRequest,
	): Promise<MailboxResult<GaReportResponse>> {
		const orderBys: GaOrderBy[] = [];
		const desc = request.orderDesc ?? false;
		if (request.orderByDimension) {
			orderBys.push({
				dimension: { dimensionName: request.orderByDimension },
				desc,
			});
		}
		if (request.orderByMetric) {
			orderBys.push({ metric: { metricName: request.orderByMetric }, desc });
		}

		const body: GaRunReportBody = {
			dateRanges: [{ startDate: request.startDate, endDate: request.endDate }],
			dimensions: (request.dimensions ?? []).map((name) => ({ name })),
			metrics: request.metrics.map((name) => ({ name })),
			orderBys,
		};
		if (request.limit) body.limit = request.limit;

		const result = await this.api.post<GaReportResponse, GaRunReportBody>(
			`${GOOGLE_ANALYTICS.dataBaseUrl}/properties/${propertyId}:runReport`,
			accessToken,
			body,
		);

		if (result.outcome !== "ok") return result;

		const parsed = gaReportResponse.safeParse(result.data);
		if (!parsed.success) {
			return {
				outcome: "failed",
				reason: "Google Analytics returned an unexpected report.",
				retryable: false,
			};
		}

		return { outcome: "ok", data: parsed.data };
	}
}
