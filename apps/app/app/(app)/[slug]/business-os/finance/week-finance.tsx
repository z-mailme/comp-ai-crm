"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	Table as TablePrimitive,
	TableRow,
} from "@crm/ui/components/table";
import { formatCount, formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type WeekFinance = RouterOutputs["finance"]["week"];
type WeekRow = WeekFinance["rows"][number];
type ExpenseEntry = WeekFinance["expenses"][number];
type ExpenseCategory = ExpenseEntry["category"];

const CELL = "px-3 py-2.5 align-middle";

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
	{ value: "TRAVEL", label: "Travel" },
	{ value: "SUPPLIES", label: "Supplies" },
	{ value: "EQUIPMENT", label: "Equipment" },
	{ value: "PRINTING", label: "Printing" },
	{ value: "OTHER", label: "Other" },
];

const ISSUE_LABELS: Record<WeekRow["issues"][number], string> = {
	PRICE_NEEDED: "Price needed",
	OPERATOR_COUNT_NEEDED: "Operator count needed",
	DURATION_NEEDED: "Times needed",
	REVENUE_UNCONVERTED: "No exchange rate",
};

const EVENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "date", header: "Date", width: "w-28" },
	{ id: "event", header: "Event" },
	{
		id: "company",
		header: "Company",
		width: "w-44",
		className: "hidden md:table-cell",
	},
	{ id: "duration", header: "Duration", width: "w-24", align: "right" },
	{ id: "operators", header: "Operators", width: "w-24", align: "right" },
	{ id: "labour", header: "Labour", width: "w-28", align: "right" },
	{ id: "revenue", header: "Revenue", width: "w-28", align: "right" },
	{ id: "issues", header: "Issues", width: "w-48" },
];

function mondayOfToday(): string {
	const now = new Date();
	const offset = (now.getDay() + 6) % 7;
	const monday = new Date(now.getTime() - offset * 86_400_000);
	return toDay(monday);
}

function toDay(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function shiftWeek(weekStart: string, weeks: number): string {
	const date = new Date(`${weekStart}T00:00:00`);
	date.setDate(date.getDate() + weeks * 7);
	return toDay(date);
}

function weekLabel(weekStart: string): string {
	const start = new Date(`${weekStart}T00:00:00`);
	const end = new Date(start.getTime() + 6 * 86_400_000);
	const options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
	};
	return `${start.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, { ...options, year: "numeric" })}`;
}

function formatDuration(minutes: number | null): string | null {
	if (minutes == null) return null;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0
		? `${hours}h`
		: `${hours}h ${String(rest).padStart(2, "0")}m`;
}

export function WeekFinance() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [weekStart, setWeekStart] = useState(mondayOfToday);
	const [selected, setSelected] = useState<WeekRow | null>(null);
	const [expenseDraft, setExpenseDraft] = useState<{
		bookingId?: string;
		eventLabel?: string;
	} | null>(null);

	const weekQuery = useQuery(trpc.finance.week.queryOptions({ weekStart }));
	const week = weekQuery.data;

	const addExpense = useMutation(
		trpc.finance.addExpense.mutationOptions({
			onSuccess: async () => {
				await cache.finance();
				setExpenseDraft(null);
				toast.success("Expense added.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const cancelExpense = useMutation(
		trpc.finance.cancelExpense.mutationOptions({
			onSuccess: async () => {
				await cache.finance();
				toast.success("Expense cancelled.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-lg">This week's events</h2>
					<p className="text-muted-foreground text-sm">
						Revenue, operator labour and expenses per booked event. Labour is
						calculated in {week?.totals.operatorLabourCurrency ?? "ZAR"}.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setWeekStart(mondayOfToday())}
						disabled={weekStart === mondayOfToday()}
					>
						This week
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
					>
						Next
					</Button>
					<Button size="sm" onClick={() => setExpenseDraft({})}>
						Add expense
					</Button>
				</div>
			</div>

			{!week ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : (
				<>
					<StatGroup>
						<StatCard
							label={`Expected revenue · ${week.reportingCurrency}`}
							value={formatMoney(
								week.totals.expectedRevenueCents,
								week.reportingCurrency,
							)}
							description={`${formatCount(week.totals.events, "event")} · ${formatCount(week.totals.priceNeededCount, "event")} need a price`}
						/>
						<StatCard
							label="Confirmed revenue"
							value={formatMoney(
								week.totals.confirmedRevenueCents,
								week.reportingCurrency,
							)}
							description={`${formatCount(week.totals.confirmedEvents, "confirmed event")}`}
						/>
						<StatCard
							label="Payments received"
							value={formatMoney(
								week.totals.paymentsReceivedCents,
								week.reportingCurrency,
							)}
							description={`${formatMoney(week.totals.outstandingCents, week.reportingCurrency)} outstanding`}
						/>
						<StatCard
							label={`Operator labour · ${week.totals.operatorLabourCurrency}`}
							value={formatMoney(
								week.totals.operatorLabourCents,
								week.totals.operatorLabourCurrency,
							)}
							description={
								week.totals.labourExcludedFromTotals
									? `Not added to ${week.reportingCurrency} totals`
									: "Included in gross profit"
							}
						/>
						<StatCard
							label="Other expenses"
							value={formatMoney(
								week.totals.otherExpensesCents,
								week.reportingCurrency,
							)}
							description="Manual expenses this week"
						/>
						<StatCard
							label="Projected gross profit"
							value={
								week.totals.projectedGrossProfitCents != null
									? formatMoney(
											week.totals.projectedGrossProfitCents,
											week.reportingCurrency,
										)
									: "—"
							}
							description={
								week.totals.projectedGrossProfitCents != null
									? "Revenue minus labour and expenses"
									: "Needs prices, rates and one currency"
							}
						/>
					</StatGroup>

					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Events · {weekLabel(weekStart)}</CardTitle>
							<CardDescription>
								Select an event for the full breakdown and evidence.
							</CardDescription>
						</CardHeader>
						{week.rows.length === 0 ? (
							<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
								No bookings this week.
							</p>
						) : (
							<SimpleTable columns={EVENT_COLUMNS}>
								{week.rows.map((row) => (
									<SimpleTableRow
										key={row.bookingId}
										clickable
										onClick={() => setSelected(row)}
									>
										<TableCell className={CELL}>
											{new Date(`${row.eventDate}T00:00:00`).toLocaleDateString(
												undefined,
												{
													weekday: "short",
													month: "short",
													day: "numeric",
												},
											)}
										</TableCell>
										<TableCell className={`${CELL} font-medium`}>
											{row.event}
										</TableCell>
										<TableCell className={`${CELL} hidden md:table-cell`}>
											{row.company}
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{formatDuration(row.durationMinutes) ?? (
												<EmptyCellValue />
											)}
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{row.operatorCount ?? <EmptyCellValue />}
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{row.operatorCostCents != null ? (
												formatMoney(
													row.operatorCostCents,
													week.totals.operatorLabourCurrency,
												)
											) : row.estimatedLabourWithOneOperatorCents != null ? (
												<span className="text-muted-foreground">
													~
													{formatMoney(
														row.estimatedLabourWithOneOperatorCents,
														week.totals.operatorLabourCurrency,
													)}
												</span>
											) : (
												<EmptyCellValue />
											)}
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{row.revenueCents != null ? (
												formatMoney(row.revenueCents, week.reportingCurrency)
											) : (
												<EmptyCellValue />
											)}
										</TableCell>
										<TableCell className={CELL}>
											<div className="flex flex-wrap gap-1">
												{row.issues.map((issue) => (
													<Badge key={issue} variant="outline">
														{ISSUE_LABELS[issue]}
													</Badge>
												))}
											</div>
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</Card>
				</>
			)}

			<Dialog
				open={selected !== null}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
			>
				{selected && week ? (
					<DialogContent className="max-w-2xl">
						<DialogHeader>
							<DialogTitle>{selected.event}</DialogTitle>
							<DialogDescription>
								{selected.company} ·{" "}
								{new Date(`${selected.eventDate}T00:00:00`).toLocaleDateString(
									undefined,
									{
										weekday: "long",
										month: "long",
										day: "numeric",
										year: "numeric",
									},
								)}
							</DialogDescription>
						</DialogHeader>
						<EventBreakdown
							row={selected}
							week={week}
							expenses={week.expenses.filter(
								(expense) => expense.bookingId === selected.bookingId,
							)}
							onAddExpense={() =>
								setExpenseDraft({
									bookingId: selected.bookingId,
									eventLabel: selected.event,
								})
							}
							onCancelExpense={(id) => cancelExpense.mutate({ id })}
							cancelling={cancelExpense.isPending}
						/>
					</DialogContent>
				) : null}
			</Dialog>

			<ExpenseDialog
				draft={expenseDraft}
				week={week}
				pending={addExpense.isPending}
				onClose={() => setExpenseDraft(null)}
				onSubmit={(input) => addExpense.mutate(input)}
			/>
		</section>
	);
}

function EventBreakdown({
	row,
	week,
	expenses,
	onAddExpense,
	onCancelExpense,
	cancelling,
}: {
	row: WeekRow;
	week: WeekFinance;
	expenses: ExpenseEntry[];
	onAddExpense: () => void;
	onCancelExpense: (id: string) => void;
	cancelling: boolean;
}) {
	const facts: { label: string; value: string }[] = [
		{ label: "Status", value: row.status.toLowerCase().replace("_", " ") },
		{
			label: "Time",
			value:
				row.startsAt && row.endsAt
					? `${new Date(row.startsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${new Date(row.endsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
					: "Not scheduled",
		},
		{
			label: "Operators",
			value: row.operatorCount != null ? String(row.operatorCount) : "Unknown",
		},
		{
			label: "Rate per operator",
			value:
				row.operatorRateCents != null
					? formatMoney(
							row.operatorRateCents,
							week.totals.operatorLabourCurrency,
						)
					: "—",
		},
		{
			label: "Operator labour",
			value:
				row.operatorCostCents != null
					? formatMoney(
							row.operatorCostCents,
							week.totals.operatorLabourCurrency,
						)
					: "—",
		},
		{
			label: "Revenue",
			value:
				row.revenueCents != null
					? formatMoney(row.revenueCents, week.reportingCurrency)
					: "No price",
		},
		{
			label: "Payments received",
			value:
				row.paymentsReceivedCents != null
					? formatMoney(row.paymentsReceivedCents, week.reportingCurrency)
					: "—",
		},
		{
			label: "Projected margin",
			value:
				row.projectedMarginCents != null
					? formatMoney(row.projectedMarginCents, week.reportingCurrency)
					: "—",
		},
	];

	return (
		<div className="flex flex-col gap-5">
			{row.issues.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{row.issues.map((issue) => (
						<Badge key={issue} variant="outline">
							{ISSUE_LABELS[issue]}
						</Badge>
					))}
				</div>
			) : null}

			<div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
				{facts.map((fact) => (
					<div key={fact.label} className="flex flex-col gap-0.5">
						<span className="text-muted-foreground text-xs">{fact.label}</span>
						<span className="font-medium text-sm tabular-nums">
							{fact.value}
						</span>
					</div>
				))}
			</div>

			{row.evidence.length > 0 ? (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-sm">Evidence</h3>
					<ul className="flex flex-col gap-1 text-muted-foreground text-sm">
						{row.evidence.map((item) => (
							<li key={item.id}>
								{item.label}
								{item.occurredAt
									? ` · ${new Date(item.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
									: ""}
							</li>
						))}
					</ul>
				</div>
			) : null}

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<h3 className="font-medium text-sm">Expenses</h3>
					<Button variant="outline" size="xs" onClick={onAddExpense}>
						Add expense
					</Button>
				</div>
				{expenses.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No expenses recorded for this event.
					</p>
				) : (
					<TablePrimitive>
						<TableHeader>
							<TableRow>
								<TableHead>Category</TableHead>
								<TableHead>Note</TableHead>
								<TableHead className="text-right">Amount</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{expenses.map((expense) => (
								<TableRow key={expense.id}>
									<TableCell>
										{expense.category.toLowerCase().replace("_", " ")}
										{expense.source === "CALCULATED" ? (
											<span className="text-muted-foreground"> · auto</span>
										) : null}
									</TableCell>
									<TableCell className="max-w-0 truncate">
										{expense.note ?? <EmptyCellValue />}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(expense.amountCents, expense.currency)}
									</TableCell>
									<TableCell className="text-right">
										{expense.source === "MANUAL" ? (
											<Button
												variant="ghost"
												size="xs"
												disabled={cancelling}
												onClick={() => onCancelExpense(expense.id)}
											>
												Cancel
											</Button>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TablePrimitive>
				)}
			</div>
		</div>
	);
}

function ExpenseDialog({
	draft,
	week,
	pending,
	onClose,
	onSubmit,
}: {
	draft: { bookingId?: string; eventLabel?: string } | null;
	week: WeekFinance | undefined;
	pending: boolean;
	onClose: () => void;
	onSubmit: (input: {
		bookingId?: string;
		category: ExpenseCategory;
		amountCents: number;
		currency?: string;
		incurredAt: string;
		note?: string;
	}) => void;
}) {
	const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("");
	const [incurredAt, setIncurredAt] = useState("");
	const [note, setNote] = useState("");

	const reporting = week?.reportingCurrency ?? "USD";
	const currencyOptions = [
		...new Set([reporting, week?.totals.operatorLabourCurrency ?? "ZAR"]),
	];
	const resolvedCurrency = currency || reporting;

	function submit() {
		const major = Number.parseFloat(amount);
		if (!Number.isFinite(major) || major <= 0) {
			toast.error("Enter an amount greater than zero.");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredAt)) {
			toast.error("Pick the date the cost was incurred.");
			return;
		}
		onSubmit({
			bookingId: draft?.bookingId,
			category,
			amountCents: Math.round(major * 100),
			currency: resolvedCurrency,
			incurredAt,
			note: note.trim() || undefined,
		});
	}

	return (
		<Dialog
			open={draft !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add expense</DialogTitle>
					<DialogDescription>
						{draft?.eventLabel
							? `Recorded against ${draft.eventLabel}.`
							: "A general expense for this business."}
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel>Category</FieldLabel>
						<Select
							value={category}
							onValueChange={(value) => setCategory(value as ExpenseCategory)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPENSE_CATEGORIES.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel>Amount</FieldLabel>
						<div className="flex gap-2">
							<Input
								type="number"
								min="0"
								step="0.01"
								placeholder="0.00"
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
							/>
							<Select value={resolvedCurrency} onValueChange={setCurrency}>
								<SelectTrigger className="w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{currencyOptions.map((code) => (
										<SelectItem key={code} value={code}>
											{code}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</Field>
					<Field>
						<FieldLabel>Date incurred</FieldLabel>
						<Input
							type="date"
							value={incurredAt}
							onChange={(event) => setIncurredAt(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel>Note</FieldLabel>
						<Input
							placeholder="Fuel, prints, …"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={pending}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={pending}>
						Save expense
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
