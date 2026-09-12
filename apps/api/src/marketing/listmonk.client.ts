import { Injectable } from "@nestjs/common";
import { z } from "zod";

const listmonkList = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string(),
	status: z.string(),
	subscriber_count: z.number().nullable().optional(),
});

const listmonkCampaign = z.object({
	id: z.number(),
	name: z.string(),
	subject: z.string().nullable().optional(),
	status: z.string(),
	type: z.string().nullable().optional(),
	sent: z.number().nullable().optional(),
	views: z.number().nullable().optional(),
	clicks: z.number().nullable().optional(),
	bounces: z.number().nullable().optional(),
	unsubscribes: z.number().nullable().optional(),
	send_at: z.string().nullable().optional(),
	created_at: z.string().nullable().optional(),
	updated_at: z.string().nullable().optional(),
	started_at: z.string().nullable().optional(),
});

const listmonkTemplate = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string().nullable().optional(),
});

const listmonkSubscriber = z.object({
	id: z.number(),
	email: z.string(),
	name: z.string().nullable().optional(),
	status: z.string(),
	lists: z
		.array(
			z.object({
				id: z.number(),
				subscription_status: z.string().nullable().optional(),
			}),
		)
		.default([]),
});

const page = <T extends z.ZodTypeAny>(item: T) =>
	z.object({
		data: z.object({
			results: z.array(item).default([]),
			total: z.number().nullable().optional(),
		}),
	});

const createdCampaign = z.object({
	data: z.object({
		id: z.number(),
		status: z.string().optional(),
	}),
});

const createdList = z.object({
	data: z.object({
		id: z.number(),
		name: z.string(),
		status: z.string(),
		subscriber_count: z.number().nullable().optional(),
	}),
});

const createdSubscriber = z.object({
	data: z.object({
		id: z.number(),
	}),
});

const updatedCampaign = z.object({
	data: z.object({
		id: z.number(),
		status: z.string(),
		send_at: z.string().nullable().optional(),
	}),
});

export type ListmonkConfig = {
	baseUrl: string;
	authMethod: "basic" | "token";
	username?: string;
	password?: string;
	token?: string;
};

export type ListmonkCampaign = z.infer<typeof listmonkCampaign>;
export type ListmonkList = z.infer<typeof listmonkList>;
export type ListmonkTemplate = z.infer<typeof listmonkTemplate>;
export type ListmonkSubscriber = z.infer<typeof listmonkSubscriber>;

@Injectable()
export class ListmonkClient {
	async dashboard(config: ListmonkConfig) {
		const [campaigns, lists, templates, subscribers] = await Promise.all([
			this.get(
				config,
				"/api/campaigns?page=1&per_page=50&no_body=true",
				page(listmonkCampaign),
			),
			this.get(config, "/api/lists?page=1&per_page=50", page(listmonkList)),
			this.get(
				config,
				"/api/templates?page=1&per_page=50",
				page(listmonkTemplate),
			),
			this.get(
				config,
				"/api/subscribers?page=1&per_page=1",
				page(z.object({ id: z.number() })),
			),
		]);

		return {
			campaigns: campaigns.data.results,
			lists: lists.data.results,
			templates: templates.data.results,
			subscriberTotal: subscribers.data.total ?? null,
		};
	}

	async createCampaign(
		config: ListmonkConfig,
		input: {
			name: string;
			subject: string;
			body: string;
			listIds: number[];
			fromEmail?: string;
			sendAt?: string;
			tags?: string[];
		},
	) {
		return this.request(config, "/api/campaigns", {
			method: "POST",
			json: {
				name: input.name,
				subject: input.subject,
				type: "regular",
				content_type: "html",
				body: input.body,
				lists: input.listIds,
				from_email: input.fromEmail,
				send_at: input.sendAt,
				tags: input.tags?.length ? input.tags : undefined,
			},
			schema: createdCampaign,
		});
	}

	async updateCampaign(
		config: ListmonkConfig,
		input: { campaignId: number; sendAt?: string },
	) {
		return this.request(config, `/api/campaigns/${input.campaignId}`, {
			method: "PUT",
			json: { send_at: input.sendAt },
			schema: updatedCampaign,
		});
	}

	async updateCampaignStatus(
		config: ListmonkConfig,
		input: {
			campaignId: number;
			status: "scheduled" | "running" | "paused" | "cancelled" | "draft";
		},
	) {
		return this.request(config, `/api/campaigns/${input.campaignId}/status`, {
			method: "PUT",
			json: { status: input.status },
			schema: updatedCampaign,
		});
	}

	async sendTest(
		config: ListmonkConfig,
		input: { campaignId: number; recipients: string[] },
	) {
		const body = new FormData();
		for (const recipient of input.recipients)
			body.append("subscribers", recipient);
		await this.request(config, `/api/campaigns/${input.campaignId}/test`, {
			method: "POST",
			body,
			schema: z.unknown(),
		});
	}

	async createList(
		config: ListmonkConfig,
		input: { name: string; description?: string },
	) {
		return this.request(config, "/api/lists", {
			method: "POST",
			json: {
				name: input.name,
				type: "private",
				optin: "single",
				description: input.description,
			},
			schema: createdList,
		});
	}

	async subscribers(
		config: ListmonkConfig,
		input: { listId?: number; page: number; perPage: number | "all" },
	) {
		const params = new URLSearchParams();
		params.set("page", String(input.page));
		params.set("per_page", String(input.perPage));
		if (input.listId) params.set("list_id", String(input.listId));

		const result = await this.get(
			config,
			`/api/subscribers?${params.toString()}`,
			page(listmonkSubscriber),
		);

		return {
			total: result.data.total ?? null,
			subscribers: result.data.results,
		};
	}

	async createSubscriber(
		config: ListmonkConfig,
		input: { email: string; name: string; listIds: number[] },
	) {
		return this.request(config, "/api/subscribers", {
			method: "POST",
			json: {
				email: input.email,
				name: input.name,
				status: "enabled",
				lists: input.listIds,
				preconfirm_subscriptions: true,
			},
			schema: createdSubscriber,
		});
	}

	private async get<T extends z.ZodTypeAny>(
		config: ListmonkConfig,
		path: string,
		schema: T,
	): Promise<z.infer<T>> {
		return this.request(config, path, { method: "GET", schema });
	}

	private async request<T extends z.ZodTypeAny>(
		config: ListmonkConfig,
		path: string,
		options: {
			method: string;
			body?: FormData;
			json?: object;
			schema: T;
		},
	): Promise<z.infer<T>> {
		const json =
			options.json !== undefined ? JSON.stringify(options.json) : undefined;
		const body = json ?? options.body;
		const headers =
			json !== undefined
				? { ...authHeaders(config), "content-type": "application/json" }
				: authHeaders(config);

		const response = await fetch(new URL(path, config.baseUrl), {
			method: options.method,
			headers,
			body,
		});

		if (!response.ok) {
			throw new Error(`Listmonk returned HTTP ${response.status}.`);
		}

		return options.schema.parse(await response.json());
	}
}

type AuthHeaders = { authorization: string };

function authHeaders(config: ListmonkConfig): AuthHeaders {
	if (config.authMethod === "token" && config.token) {
		return { authorization: `Bearer ${config.token}` };
	}

	const raw = `${config.username ?? ""}:${config.password ?? config.token ?? ""}`;
	return { authorization: `Basic ${Buffer.from(raw).toString("base64")}` };
}
