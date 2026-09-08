export const MAILBOX_VIEW_IDS = [
	"inbox",
	"starred",
	"sent",
	"drafts",
	"important",
	"all",
	"spam",
	"trash",
] as const;

export type MailboxViewId = (typeof MAILBOX_VIEW_IDS)[number];

export type MailboxParams = {
	view: MailboxViewId;
	label: string | null;
	q: string;
	thread: string | null;
	unread: boolean;
	starred: boolean;
};

const VIEW_SET = new Set<string>(MAILBOX_VIEW_IDS);

export function parseMailboxParams(params: URLSearchParams): MailboxParams {
	const rawView = params.get("view") ?? "";
	return {
		view: VIEW_SET.has(rawView) ? (rawView as MailboxViewId) : "inbox",
		label: params.get("label") || null,
		q: params.get("q") ?? "",
		thread: params.get("thread") || null,
		unread: params.get("unread") === "1",
		starred: params.get("starred") === "1",
	};
}

export function mailboxSearch(params: Partial<MailboxParams>): string {
	const search = new URLSearchParams();
	if (params.view && params.view !== "inbox") search.set("view", params.view);
	if (params.label) search.set("label", params.label);
	if (params.q) search.set("q", params.q);
	if (params.thread) search.set("thread", params.thread);
	if (params.unread) search.set("unread", "1");
	if (params.starred) search.set("starred", "1");
	const value = search.toString();
	return value ? `?${value}` : "";
}
