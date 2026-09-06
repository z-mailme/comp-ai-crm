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
	created_at: z.string().nullable().optional(),
	updated_at: z.string().nullable().optional(),
	started_at: z.string().nullable().optional(),
});

const listmonkTemplate = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string().nullable().optional(),
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

@Injectable()
export class ListmonkClient {
	async dashboard(config: ListmonkConfig) {
		const [campaigns, lists, templates, subscribers] = await Promise.all([
			this.get(
				config,
				"/api/campaigns?page=1&per_page=50",
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
		},
	) {
		const body = new FormData();
		body.set("name", input.name);
		body.set("subject", input.subject);
		body.set("type", "regular");
		body.set("content_type", "html");
		body.set("body", input.body);
		for (const id of input.listIds) body.append("lists", String(id));

		return this.request(config, "/api/campaigns", {
			method: "POST",
			body,
			schema: createdCampaign,
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
		options: { method: string; body?: FormData; schema: T },
	): Promise<z.infer<T>> {
		const response = await fetch(new URL(path, config.baseUrl), {
			method: options.method,
			headers: authHeaders(config),
			body: options.body,
		});

		if (!response.ok) {
			throw new Error(`Listmonk returned HTTP ${response.status}.`);
		}

		return options.schema.parse(await response.json());
	}
}

function authHeaders(config: ListmonkConfig): Record<string, string> {
	if (config.authMethod === "token" && config.token) {
		return { authorization: `Bearer ${config.token}` };
	}

	const raw = `${config.username ?? ""}:${config.password ?? config.token ?? ""}`;
	return { authorization: `Basic ${Buffer.from(raw).toString("base64")}` };
}
