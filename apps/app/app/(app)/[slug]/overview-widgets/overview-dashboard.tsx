"use client";

import Add from "@carbon/icons-react/es/Add";
import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	DEFAULT_LAYOUT,
	type LayoutItem,
	WIDGET_CATEGORY_LABELS,
	WIDGET_CATEGORY_ORDER,
	WIDGETS,
	type WidgetId,
} from "./registry";

export function OverviewDashboard() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [draft, setDraft] = useState<LayoutItem[] | null>(null);
	const [adding, setAdding] = useState(false);

	const layoutQuery = useQuery(trpc.dashboard.layout.queryOptions());
	const saved = layoutQuery.data?.layout ?? null;

	const saveLayout = useMutation(
		trpc.dashboard.saveLayout.mutationOptions({
			onSuccess: async () => {
				await cache.dashboardLayout();
				setDraft(null);
				toast.success("Overview layout saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const editing = draft !== null;
	const layout = draft ?? saved ?? DEFAULT_LAYOUT;

	function move(index: number, delta: number) {
		setDraft((current) => {
			if (!current) return current;
			const next = [...current];
			const target = index + delta;
			if (target < 0 || target >= next.length) return current;
			const [item] = next.splice(index, 1);
			if (!item) return current;
			next.splice(target, 0, item);
			return next;
		});
	}

	function toggleSize(index: number) {
		setDraft((current) => {
			if (!current) return current;
			const item = current[index];
			if (!item) return current;
			const sizes = WIDGETS[item.id].sizes;
			if (sizes.length < 2) return current;
			const next = [...current];
			next[index] = { ...item, size: item.size === "half" ? "full" : "half" };
			return next;
		});
	}

	function remove(index: number) {
		setDraft((current) =>
			current ? current.filter((_, at) => at !== index) : current,
		);
	}

	function addWidget(id: WidgetId) {
		setDraft((current) => {
			if (!current) return current;
			return [...current, { id, size: WIDGETS[id].defaultSize }];
		});
		setAdding(false);
	}

	function restoreDefault() {
		setDraft([...DEFAULT_LAYOUT].map((item) => ({ ...item })));
	}

	function save() {
		if (!draft) return;
		const isDefault =
			saved === null &&
			JSON.stringify(draft) === JSON.stringify(DEFAULT_LAYOUT);
		saveLayout.mutate({ layout: isDefault ? null : draft });
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-end gap-2">
				{editing ? (
					<>
						<Button variant="outline" size="sm" onClick={() => setAdding(true)}>
							<Icon icon={Add} data-icon="inline-start" />
							Add widget
						</Button>
						<Button variant="outline" size="sm" onClick={restoreDefault}>
							Restore default
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setDraft(null)}
							disabled={saveLayout.isPending}
						>
							Cancel
						</Button>
						<Button size="sm" onClick={save} disabled={saveLayout.isPending}>
							Save layout
						</Button>
					</>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setDraft((saved ?? DEFAULT_LAYOUT).map((item) => ({ ...item })))
						}
					>
						Customize
					</Button>
				)}
			</div>

			{layoutQuery.isPending && !editing ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : (
				<div className="grid gap-6 @3xl/page-content:grid-cols-2">
					{layout.map((item, index) => {
						const definition = WIDGETS[item.id];
						const Widget = definition.component;
						return (
							<div
								key={item.id}
								className={cn(
									"min-w-0",
									item.size === "full" && "@3xl/page-content:col-span-2",
								)}
							>
								{editing ? (
									<div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
										<div className="flex items-center justify-between gap-2">
											<span className="px-1 font-medium text-muted-foreground text-xs">
												{definition.title}
											</span>
											<div className="flex items-center gap-1">
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move ${definition.title} up`}
													disabled={index === 0}
													onClick={() => move(index, -1)}
												>
													<Icon icon={ArrowUp} />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move ${definition.title} down`}
													disabled={index === layout.length - 1}
													onClick={() => move(index, 1)}
												>
													<Icon icon={ArrowDown} />
												</Button>
												{definition.sizes.length > 1 ? (
													<Button
														variant="ghost"
														size="xs"
														onClick={() => toggleSize(index)}
													>
														{item.size === "half" ? "Full" : "Half"}
													</Button>
												) : null}
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Remove ${definition.title}`}
													onClick={() => remove(index)}
												>
													<Icon icon={Close} />
												</Button>
											</div>
										</div>
										<Widget />
									</div>
								) : (
									<Widget />
								)}
							</div>
						);
					})}
				</div>
			)}

			<Sheet open={adding} onOpenChange={setAdding}>
				<SheetContent side="right" className="overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Add a widget</SheetTitle>
						<SheetDescription>
							Widgets only show real data from your connected tools.
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-6 px-4 pb-6">
						{WIDGET_CATEGORY_ORDER.map((category) => {
							const entries = Object.values(WIDGETS).filter(
								(widget) => widget.category === category,
							);
							if (entries.length === 0) return null;
							return (
								<div key={category} className="flex flex-col gap-2">
									<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										{WIDGET_CATEGORY_LABELS[category]}
									</h3>
									{entries.map((widget) => {
										const added =
											draft?.some((item) => item.id === widget.id) ?? false;
										return (
											<button
												key={widget.id}
												type="button"
												disabled={added}
												onClick={() => addWidget(widget.id)}
												className={cn(
													"flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-left transition-colors",
													added
														? "cursor-not-allowed opacity-50"
														: "hover:bg-muted",
												)}
											>
												<span className="font-medium text-sm">
													{widget.title}
												</span>
												<span className="text-muted-foreground text-xs">
													{widget.description}
												</span>
											</button>
										);
									})}
								</div>
							);
						})}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
