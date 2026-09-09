import type { RouterOutputs } from "@/lib/trpc/types";

export type MailboxLabel = RouterOutputs["google"]["gmailLabels"][number];

export type LabelNode = {
	label: MailboxLabel;
	segment: string;
	children: LabelNode[];
};

export function buildLabelTree(labels: readonly MailboxLabel[]): LabelNode[] {
	const userLabels = labels.filter(
		(label) =>
			label.type === "user" && label.labelListVisibility !== "labelHide",
	);

	const roots: LabelNode[] = [];
	const nodes = new Map<string, LabelNode>();

	for (const label of [...userLabels].sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		const segments = label.name.split("/");
		let path = "";
		let siblings = roots;

		for (const segment of segments) {
			path = path ? `${path}/${segment}` : segment;
			let node = nodes.get(path);

			if (!node) {
				const isLeaf = path === label.name;
				node = {
					label: isLeaf ? label : virtualParent(path, label),
					segment,
					children: [],
				};
				nodes.set(path, node);
				siblings.push(node);
			} else if (path === label.name) {
				node.label = label;
			}

			siblings = node.children;
		}
	}

	return roots;
}

export function labelsById(
	labels: readonly MailboxLabel[],
): Map<string, MailboxLabel> {
	return new Map(labels.map((label) => [label.gmailLabelId, label]));
}

export function systemLabelById(
	labels: readonly MailboxLabel[],
	gmailLabelId: string,
): MailboxLabel | null {
	return (
		labels.find(
			(label) => label.type === "system" && label.gmailLabelId === gmailLabelId,
		) ?? null
	);
}

function virtualParent(path: string, source: MailboxLabel): MailboxLabel {
	return {
		...source,
		id: `virtual-${path}`,
		gmailLabelId: "",
		name: path,
		type: "user",
		messagesUnread: null,
		messagesTotal: null,
	};
}
