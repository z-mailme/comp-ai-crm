import { db, type Prisma } from "@crm/db";
import { gateway, generateObject } from "ai";
import { z } from "zod";
import { MARKETING_ASSIST } from "./marketing-content-config";
import { selectedModel } from "./model";

export const marketingContentAssistPayload = z.object({
	contentId: z.string().min(1),
	businessUnitId: z.string().min(1),
	instruction: z.string().max(MARKETING_ASSIST.instructionChars).default(""),
});

export const marketingContentSuggestion = z.object({
	caption: z.string(),
	headline: z.string().nullable(),
	variants: z.array(z.string()).max(MARKETING_ASSIST.maxVariants),
	hashtags: z.array(z.string()).max(MARKETING_ASSIST.maxHashtags),
});

export type MarketingContentSuggestion = z.infer<
	typeof marketingContentSuggestion
>;

const ASSIST_SYSTEM_PROMPT = [
	"You draft marketing copy for the company you work for.",
	"The business knowledge supplied is factual grounding; the brief is the job.",
	"Write in the company's own voice. Do not invent offers, prices, or claims.",
	"Never state performance numbers. Never promise results.",
	"Return only valid JSON matching the required schema.",
	'"caption" is the primary body copy.',
	'"headline" is a short title line or null when the format has none.',
	'"variants" holds up to three alternate captions.',
	'"hashtags" holds plain tags without the leading #.',
].join(" ");

export async function runMarketingContentAssist(
	payload: Prisma.JsonValue | null,
): Promise<string> {
	const parsed = marketingContentAssistPayload.safeParse(payload);
	if (!parsed.success) return "No content item was named.";

	const content = await db.marketingContent.findFirst({
		where: {
			id: parsed.data.contentId,
			businessUnitId: parsed.data.businessUnitId,
		},
		include: {
			campaign: { select: { name: true, objective: true } },
		},
	});

	if (!content) return "The content item is gone.";
	if (content.archivedAt) return "The content item is archived.";

	const selection = await selectedModel();
	if (!selection) {
		return "No model is configured for marketing content assistance.";
	}

	const model =
		"gatewayId" in selection
			? gateway(selection.gatewayId)
			: selection.directModel;
	const modelId =
		"gatewayId" in selection ? selection.gatewayId : selection.directModelId;

	const knowledge = await db.businessKnowledge.findMany({
		where: {
			supersededById: null,
			OR: [
				{ businessUnitId: parsed.data.businessUnitId },
				{ businessUnitId: null },
			],
		},
		orderBy: { updatedAt: "desc" },
		take: MARKETING_ASSIST.knowledgeRows,
		select: { kind: true, subject: true, detail: true },
	});

	const knowledgeBlock = knowledge
		.map(
			(row) =>
				`- [${row.kind}] ${row.subject.slice(0, MARKETING_ASSIST.subjectChars)}${
					row.detail
						? `: ${row.detail.slice(0, MARKETING_ASSIST.detailChars)}`
						: ""
				}`,
		)
		.join("\n");

	const prompt = [
		`TITLE: ${content.title}`,
		`TYPE: ${content.type}`,
		`PLATFORMS: ${JSON.stringify(content.platforms)}`,
		content.campaign
			? `CAMPAIGN: ${content.campaign.name}${
					content.campaign.objective ? ` — ${content.campaign.objective}` : ""
				}`
			: "CAMPAIGN: (none)",
		content.cta ? `CTA: ${content.cta}` : null,
		content.link ? `LINK: ${content.link}` : null,
		parsed.data.instruction ? `INSTRUCTION: ${parsed.data.instruction}` : null,
		"",
		"BUSINESS KNOWLEDGE:",
		knowledgeBlock || "(none recorded)",
	]
		.filter((line): line is string => line !== null)
		.join("\n");

	const result = await generateObject({
		model,
		schema: marketingContentSuggestion,
		system: ASSIST_SYSTEM_PROMPT,
		prompt,
		abortSignal: AbortSignal.timeout(MARKETING_ASSIST.timeoutMs),
	});

	const suggestion = {
		...result.object,
		model: modelId,
		generatedAt: new Date().toISOString(),
		instruction: parsed.data.instruction,
	} satisfies Prisma.InputJsonObject;

	await db.marketingContent.update({
		where: { id: content.id },
		data: {
			aiSuggestion: suggestion,
			aiAssisted: true,
		},
	});

	return `Drafted copy for "${content.title}" with ${modelId}.`;
}
