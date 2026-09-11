import { z } from "zod";
import { businessContextInput } from "../business-os/business-os.contracts";

export const EMAIL_SCHEDULE_APPROVAL_TYPE = "marketing.email.schedule";

export const emailTemplateBlock = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("header"),
		text: z.string().trim().min(1).max(200),
		subtext: z.string().trim().max(400).optional(),
	}),
	z.object({
		kind: z.literal("image"),
		url: z.string().url().max(2000),
		alt: z.string().trim().max(200).optional(),
		href: z.string().url().max(2000).optional(),
	}),
	z.object({
		kind: z.literal("text"),
		text: z.string().trim().min(1).max(10000),
	}),
	z.object({
		kind: z.literal("cta"),
		label: z.string().trim().min(1).max(80),
		url: z.string().url().max(2000),
	}),
	z.object({
		kind: z.literal("footer"),
		text: z.string().trim().min(1).max(1000),
	}),
	z.object({
		kind: z.literal("unsubscribe"),
		text: z.string().trim().min(1).max(120).optional(),
	}),
]);

export const emailTemplateBlocks = z.array(emailTemplateBlock).min(1).max(40);

export const emailTemplateContextInput = businessContextInput;

export const emailTemplateByIdInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
});

export const createEmailTemplateInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(400).optional(),
	previewText: z.string().trim().max(240).optional(),
	blocks: emailTemplateBlocks,
});

export const updateEmailTemplateInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).max(160).optional(),
	description: z.string().trim().max(400).nullable().optional(),
	previewText: z.string().trim().max(240).nullable().optional(),
	blocks: emailTemplateBlocks.optional(),
});

export const archiveEmailTemplateInput = emailTemplateByIdInput;

export const composeEmailCampaignInput = z
	.object({
		businessUnitId: z.string().trim().min(1).optional(),
		name: z.string().trim().min(1).max(160),
		subject: z.string().trim().min(1).max(240),
		previewText: z.string().trim().max(240).optional(),
		fromEmail: z.string().trim().max(240).optional(),
		templateId: z.string().trim().min(1).optional(),
		body: z.string().trim().min(1).optional(),
		listIds: z.array(z.number().int().positive()).min(1).max(25),
		tags: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
	})
	.superRefine((value, context) => {
		if (!value.templateId && !value.body) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide a templateId or a raw body.",
				path: ["templateId"],
			});
		}
		if (value.templateId && value.body) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide a templateId or a raw body, not both.",
				path: ["body"],
			});
		}
	});

export const emailScheduleRequestInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	campaignId: z.number().int().positive(),
	campaignName: z.string().trim().min(1).max(160),
	sendAt: z.string().datetime({ offset: true }),
});

export const emailScheduleDecideInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	approvalRequestId: z.string().trim().min(1),
	decision: z.enum(["APPROVE", "REJECT"]),
	note: z.string().trim().max(500).optional(),
});

export const emailCreateListInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(400).optional(),
});

export const emailSyncListInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	listId: z.number().int().positive(),
});

export const emailSubscribersInput = z.object({
	businessUnitId: z.string().trim().min(1).optional(),
	listId: z.number().int().positive().optional(),
	page: z.number().int().positive().default(1),
});

export const emailScheduleMetadata = z.object({
	campaignId: z.number().int().positive(),
	sendAt: z.string().datetime({ offset: true }),
	campaignName: z.string().optional(),
});

export const emailTemplateOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	previewText: z.string().nullable(),
	blocks: z.array(emailTemplateBlock),
	status: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const emailTemplateListOutput = z.object({
	templates: z.array(emailTemplateOutput),
});

export const emailTemplateRenderOutput = z.object({
	html: z.string(),
});

export const emailCampaignOutput = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
});

export const emailScheduleOutput = z.object({
	approvalRequestId: z.string(),
	status: z.string(),
	campaignId: z.number(),
	sendAt: z.string(),
});

export const emailListOutput = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
	subscriberCount: z.number().nullable(),
});

export const emailSyncOutput = z.object({
	listId: z.number(),
	synced: z.number(),
	existing: z.number(),
	failed: z.number(),
	consentBlocked: z.number(),
});

export const emailSubscribersOutput = z.object({
	total: z.number().nullable(),
	page: z.number(),
	subscribers: z.array(
		z.object({
			id: z.number(),
			email: z.string(),
			name: z.string(),
			status: z.string(),
			subscriptionStatus: z.string().nullable(),
		}),
	),
});

export type EmailTemplateBlock = z.infer<typeof emailTemplateBlock>;
export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateInput>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateInput>;
export type ComposeEmailCampaignInput = z.infer<
	typeof composeEmailCampaignInput
>;
export type EmailScheduleRequestInput = z.infer<
	typeof emailScheduleRequestInput
>;
export type EmailScheduleDecideInput = z.infer<typeof emailScheduleDecideInput>;
export type EmailCreateListInput = z.infer<typeof emailCreateListInput>;
export type EmailSyncListInput = z.infer<typeof emailSyncListInput>;
export type EmailSubscribersInput = z.infer<typeof emailSubscribersInput>;
export type EmailTemplateOutput = z.infer<typeof emailTemplateOutput>;
