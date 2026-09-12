import type { EmailTemplateBlock } from "./email.contracts";

const EMAIL_STYLE = {
	body: "margin:0;padding:0;background-color:#f4f4f5;",
	container:
		"max-width:600px;margin:0 auto;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;",
	headerWrap: "padding:32px 32px 16px 32px;text-align:center;",
	headerText: "margin:0;font-size:24px;line-height:1.3;color:#18181b;",
	headerSubtext: "margin:8px 0 0 0;font-size:14px;color:#52525b;",
	image: "display:block;width:100%;max-width:600px;height:auto;",
	section: "padding:16px 32px;",
	paragraph: "margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#3f3f46;",
	ctaWrap: "padding:24px 32px;text-align:center;",
	ctaButton:
		"display:inline-block;padding:12px 28px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;",
	footer:
		"padding:24px 32px;font-size:12px;line-height:1.5;color:#71717a;text-align:center;border-top:1px solid #e4e4e7;",
	unsubscribe: "color:#71717a;font-size:12px;",
	preheader:
		"display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5;",
} as const;

export const LISTMONK_UNSUBSCRIBE_URL = "{{ UnsubscribeURL }}";

export function renderEmailTemplate(
	blocks: EmailTemplateBlock[],
	options: { previewText?: string | null } = {},
): string {
	const rows = blocks.map(renderBlock).join("\n");
	const preheader = options.previewText
		? `<div style="${EMAIL_STYLE.preheader}">${escapeHtml(options.previewText)}</div>`
		: "";

	return [
		`<!DOCTYPE html>`,
		`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`,
		`<body style="${EMAIL_STYLE.body}">`,
		preheader,
		`<div style="${EMAIL_STYLE.container}">`,
		rows,
		`</div>`,
		`</body></html>`,
	]
		.filter(Boolean)
		.join("\n");
}

function renderBlock(block: EmailTemplateBlock): string {
	switch (block.kind) {
		case "header": {
			const subtext = block.subtext
				? `<p style="${EMAIL_STYLE.headerSubtext}">${escapeHtml(block.subtext)}</p>`
				: "";
			return `<div style="${EMAIL_STYLE.headerWrap}"><h1 style="${EMAIL_STYLE.headerText}">${escapeHtml(block.text)}</h1>${subtext}</div>`;
		}
		case "image": {
			const alt = escapeHtml(block.alt ?? "");
			const image = `<img src="${escapeAttribute(block.url)}" alt="${alt}" style="${EMAIL_STYLE.image}">`;
			const linked = block.href
				? `<a href="${escapeAttribute(block.href)}">${image}</a>`
				: image;
			return `<div style="${EMAIL_STYLE.section};padding:0;">${linked}</div>`;
		}
		case "text": {
			const paragraphs = block.text
				.split(/\n{2,}/)
				.map(
					(part) =>
						`<p style="${EMAIL_STYLE.paragraph}">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
				)
				.join("\n");
			return `<div style="${EMAIL_STYLE.section}">${paragraphs}</div>`;
		}
		case "cta":
			return `<div style="${EMAIL_STYLE.ctaWrap}"><a href="${escapeAttribute(block.url)}" style="${EMAIL_STYLE.ctaButton}">${escapeHtml(block.label)}</a></div>`;
		case "footer":
			return `<div style="${EMAIL_STYLE.footer}">${escapeHtml(block.text).replace(/\n/g, "<br>")}</div>`;
		case "unsubscribe": {
			const label = escapeHtml(block.text ?? "Unsubscribe");
			return `<div style="${EMAIL_STYLE.footer};border-top:none;padding-top:0;"><a href="${LISTMONK_UNSUBSCRIBE_URL}" style="${EMAIL_STYLE.unsubscribe}">${label}</a></div>`;
		}
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replace(/'/g, "&#39;");
}
