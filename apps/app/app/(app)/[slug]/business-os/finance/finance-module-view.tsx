"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { WeekFinance } from "./week-finance";

const CELL = "px-3 py-2.5 align-middle";

const MONEY_COLUMNS: SimpleTableColumn[] = [
	{ id: "number", header: "Number", width: "w-32" },
	{ id: "title", header: "Title" },
	{ id: "status", header: "Status", width: "w-36" },
	{ id: "company", header: "Company", width: "w-44" },
	{ id: "total", header: "Total", width: "w-32", align: "right" },
];

const PAYMENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "date", header: "Date", width: "w-32" },
	{ id: "payer", header: "Payer" },
	{ id: "status", header: "Status", width: "w-32" },
	{ id: "invoice", header: "Invoice", width: "w-36" },
	{ id: "amount", header: "Amount", width: "w-32", align: "right" },
];

export function FinanceDashboard() {
	const trpc = useTRPC();
	const dashboard = useQuery(trpc.finance.dashboard.queryOptions({}));

	if (!dashboard.data) return <Spinner />;

	const finance = dashboard.data;

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-3 md:grid-cols-4">
				<StatCard
					label="Quotes"
					value={formatMoney(
						finance.quotes.totalCents,
						finance.reportingCurrency,
					)}
					description={`${finance.quotes.count} active`}
				/>
				<StatCard
					label="Invoices"
					value={formatMoney(
						finance.invoices.balanceCents,
						finance.reportingCurrency,
					)}
					description="Open balance"
				/>
				<StatCard
					label="Payments"
					value={formatMoney(
						finance.payments.totalCents,
						finance.reportingCurrency,
					)}
					description={`${finance.payments.count} received`}
				/>
				<StatCard
					label="Expenses"
					value={formatMoney(
						finance.expenses.totalCents,
						finance.reportingCurrency,
					)}
					description={`${finance.expenses.count} recorded`}
				/>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Attention</CardTitle>
					<CardDescription>
						Finance records that need an action.
					</CardDescription>
				</CardHeader>
				{finance.attention.length === 0 ? (
					<p className="border-t px-5 py-10 text-center text-muted-foreground text-sm">
						No finance actions need attention.
					</p>
				) : (
					<Table>
						<TableBody>
							{finance.attention.map((item) => (
								<TableRow key={`${item.kind}:${item.id}`}>
									<TableCell>
										<Badge variant="outline">{item.kind}</Badge>
									</TableCell>
									<TableCell className="font-medium">{item.title}</TableCell>
									<TableCell className="text-muted-foreground">
										{item.detail}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Card>
		</div>
	);
}

export function QuotesView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const quotes = useQuery(trpc.finance.quotes.queryOptions({}));
	const [draft, setDraft] = useState({ title: "", amount: "" });
	const createQuote = useMutation(
		trpc.finance.createQuote.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setDraft({ title: "", amount: "" });
				toast.success("Quote created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function submit() {
		const amountCents = amountToCents(draft.amount);
		if (!draft.title.trim() || amountCents === null) {
			toast.error("Enter a title and amount.");
			return;
		}
		createQuote.mutate({
			title: draft.title.trim(),
			currency: "ZAR",
			lineItems: [
				{
					description: draft.title.trim(),
					quantity: 1,
					unitAmountCents: amountCents,
				},
			],
		});
	}

	return (
		<FinanceListShell
			title="Quotes"
			description="Create, send, accept and decline customer quotes."
			form={
				<QuickMoneyForm
					title={draft.title}
					amount={draft.amount}
					pending={createQuote.isPending}
					action="Create quote"
					onTitle={(title) => setDraft((value) => ({ ...value, title }))}
					onAmount={(amount) => setDraft((value) => ({ ...value, amount }))}
					onSubmit={submit}
				/>
			}
		>
			{!quotes.data ? (
				<Spinner />
			) : (
				<SimpleTable columns={MONEY_COLUMNS}>
					{quotes.data.quotes.map((quote) => (
						<SimpleTableRow key={quote.id}>
							<TableCell className={CELL}>{quote.number}</TableCell>
							<TableCell className={`${CELL} font-medium`}>
								{quote.title}
							</TableCell>
							<TableCell className={CELL}>
								<Badge variant="outline">{quote.status}</Badge>
							</TableCell>
							<TableCell className={CELL}>
								{quote.company?.name ?? "Unassigned"}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{formatMoney(quote.totalCents, quote.currency)}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</FinanceListShell>
	);
}

export function InvoicesView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const invoices = useQuery(trpc.finance.invoices.queryOptions({}));
	const [draft, setDraft] = useState({ title: "", amount: "" });
	const createInvoice = useMutation(
		trpc.finance.createInvoice.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setDraft({ title: "", amount: "" });
				toast.success("Invoice created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function submit() {
		const amountCents = amountToCents(draft.amount);
		if (!draft.title.trim() || amountCents === null) {
			toast.error("Enter a title and amount.");
			return;
		}
		createInvoice.mutate({
			title: draft.title.trim(),
			currency: "ZAR",
			issueDate: new Date().toISOString().slice(0, 10),
			lineItems: [
				{
					description: draft.title.trim(),
					quantity: 1,
					unitAmountCents: amountCents,
				},
			],
		});
	}

	return (
		<FinanceListShell
			title="Invoices"
			description="Track issued invoices, balances and payment state."
			form={
				<QuickMoneyForm
					title={draft.title}
					amount={draft.amount}
					pending={createInvoice.isPending}
					action="Create invoice"
					onTitle={(title) => setDraft((value) => ({ ...value, title }))}
					onAmount={(amount) => setDraft((value) => ({ ...value, amount }))}
					onSubmit={submit}
				/>
			}
		>
			{!invoices.data ? (
				<Spinner />
			) : (
				<SimpleTable columns={MONEY_COLUMNS}>
					{invoices.data.invoices.map((invoice) => (
						<SimpleTableRow key={invoice.id}>
							<TableCell className={CELL}>{invoice.number}</TableCell>
							<TableCell className={`${CELL} font-medium`}>
								{invoice.title}
							</TableCell>
							<TableCell className={CELL}>
								<Badge variant="outline">{invoice.status}</Badge>
							</TableCell>
							<TableCell className={CELL}>
								{invoice.company?.name ?? "Unassigned"}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{formatMoney(invoice.balanceCents, invoice.currency)}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</FinanceListShell>
	);
}

export function PaymentsView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const payments = useQuery(trpc.finance.payments.queryOptions({}));
	const [draft, setDraft] = useState({ payer: "", amount: "", reference: "" });
	const createPayment = useMutation(
		trpc.finance.createPayment.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setDraft({ payer: "", amount: "", reference: "" });
				toast.success("Payment recorded.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function submit() {
		const amountCents = amountToCents(draft.amount);
		if (amountCents === null) {
			toast.error("Enter an amount.");
			return;
		}
		createPayment.mutate({
			amountCents,
			currency: "ZAR",
			paidAt: new Date().toISOString().slice(0, 10),
			method: "BANK_TRANSFER",
			payerName: draft.payer.trim() || undefined,
			reference: draft.reference.trim() || undefined,
		});
	}

	return (
		<FinanceListShell
			title="Payments"
			description="Record payments and identify unmatched cash."
			form={
				<FieldGroup className="grid gap-3 md:grid-cols-[1fr_160px_1fr_auto]">
					<Field>
						<FieldLabel>Payer</FieldLabel>
						<Input
							value={draft.payer}
							onChange={(event) =>
								setDraft((value) => ({ ...value, payer: event.target.value }))
							}
						/>
					</Field>
					<Field>
						<FieldLabel>Amount</FieldLabel>
						<Input
							type="number"
							min="0"
							step="0.01"
							value={draft.amount}
							onChange={(event) =>
								setDraft((value) => ({ ...value, amount: event.target.value }))
							}
						/>
					</Field>
					<Field>
						<FieldLabel>Reference</FieldLabel>
						<Input
							value={draft.reference}
							onChange={(event) =>
								setDraft((value) => ({
									...value,
									reference: event.target.value,
								}))
							}
						/>
					</Field>
					<Button onClick={submit} disabled={createPayment.isPending}>
						Record
					</Button>
				</FieldGroup>
			}
		>
			{!payments.data ? (
				<Spinner />
			) : (
				<SimpleTable columns={PAYMENT_COLUMNS}>
					{payments.data.payments.map((payment) => (
						<SimpleTableRow key={payment.id}>
							<TableCell className={CELL}>{payment.paidAt}</TableCell>
							<TableCell className={`${CELL} font-medium`}>
								{payment.payerName ?? payment.reference ?? "Payment"}
							</TableCell>
							<TableCell className={CELL}>
								<Badge variant="outline">{payment.status}</Badge>
							</TableCell>
							<TableCell className={CELL}>
								{payment.invoice?.name ?? "Unmatched"}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{formatMoney(payment.amountCents, payment.currency)}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</FinanceListShell>
	);
}

export function ExpensesView() {
	return <WeekFinance />;
}

export function AccountingView() {
	const trpc = useTRPC();
	const accounting = useQuery(trpc.finance.accounting.queryOptions({}));

	if (!accounting.data) return <Spinner />;

	return (
		<div className="grid gap-6 lg:grid-cols-[360px_1fr]">
			<Card>
				<CardHeader>
					<CardTitle>Accounts</CardTitle>
					<CardDescription>System ledger accounts.</CardDescription>
				</CardHeader>
				<Table>
					<TableBody>
						{accounting.data.accounts.map((account) => (
							<TableRow key={account.id}>
								<TableCell>
									<div className="font-medium">{account.name}</div>
									<div className="text-muted-foreground text-xs">
										{account.code} · {account.type}
									</div>
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatMoney(account.balanceCents, account.currency)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Ledger</CardTitle>
					<CardDescription>Invoice and payment postings.</CardDescription>
				</CardHeader>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Account</TableHead>
							<TableHead>Source</TableHead>
							<TableHead className="text-right">Debit</TableHead>
							<TableHead className="text-right">Credit</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{accounting.data.entries.map((entry) => (
							<TableRow key={entry.id}>
								<TableCell>{entry.occurredAt}</TableCell>
								<TableCell>{entry.account.name}</TableCell>
								<TableCell>{entry.source}</TableCell>
								<TableCell className="text-right tabular-nums">
									{entry.debitCents > 0
										? formatMoney(entry.debitCents, entry.currency)
										: "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{entry.creditCents > 0
										? formatMoney(entry.creditCents, entry.currency)
										: "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
		</div>
	);
}

function FinanceListShell({
	title,
	description,
	form,
	children,
}: {
	title: string;
	description: string;
	form: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<div className="border-t p-5">{form}</div>
			</Card>
			<Card>{children}</Card>
		</div>
	);
}

function QuickMoneyForm({
	title,
	amount,
	pending,
	action,
	onTitle,
	onAmount,
	onSubmit,
}: {
	title: string;
	amount: string;
	pending: boolean;
	action: string;
	onTitle: (value: string) => void;
	onAmount: (value: string) => void;
	onSubmit: () => void;
}) {
	return (
		<FieldGroup className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
			<Field>
				<FieldLabel>Title</FieldLabel>
				<Input
					value={title}
					onChange={(event) => onTitle(event.target.value)}
				/>
			</Field>
			<Field>
				<FieldLabel>Amount</FieldLabel>
				<Input
					type="number"
					min="0"
					step="0.01"
					value={amount}
					onChange={(event) => onAmount(event.target.value)}
				/>
			</Field>
			<Button onClick={onSubmit} disabled={pending}>
				{action}
			</Button>
		</FieldGroup>
	);
}

function amountToCents(value: string): number | null {
	const amount = Number.parseFloat(value);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	return Math.round(amount * 100);
}
