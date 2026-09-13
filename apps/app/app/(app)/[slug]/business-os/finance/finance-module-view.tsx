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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { Textarea } from "@crm/ui/components/textarea";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
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
	{ id: "actions", header: "", width: "w-56", align: "right" },
];

const DOCUMENT_COLUMNS: SimpleTableColumn[] = [
	...MONEY_COLUMNS,
	{ id: "actions", header: "", width: "w-72", align: "right" },
];

type QuoteRecord = RouterOutputs["finance"]["quotes"]["quotes"][number];
type InvoiceRecord = RouterOutputs["finance"]["invoices"]["invoices"][number];
type PaymentRecord = RouterOutputs["finance"]["payments"]["payments"][number];

export function FinanceDashboard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const dashboard = useQuery(trpc.finance.dashboard.queryOptions({}));
	const settings = useQuery(trpc.finance.settings.queryOptions({}));
	const updateSettings = useMutation(
		trpc.finance.updateSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Finance settings saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

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
			{settings.data ? (
				<FinanceSettingsCard
					settings={settings.data}
					pending={updateSettings.isPending}
					onSubmit={(input) => updateSettings.mutate(input)}
				/>
			) : null}
		</div>
	);
}

function FinanceSettingsCard({
	settings,
	pending,
	onSubmit,
}: {
	settings: RouterOutputs["finance"]["settings"];
	pending: boolean;
	onSubmit: (input: {
		defaultCurrency: string;
		taxEnabled: boolean;
		taxRateBasisPoints: number;
		depositBasisPoints: number;
		quoteValidityDays: number;
		invoiceDueDays: number;
		quotePrefix: string;
		invoicePrefix: string;
		operatorShortRateCents: number;
		operatorLongRateCents: number;
		operatorThresholdMinutes: number;
	}) => void;
}) {
	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		onSubmit({
			defaultCurrency: String(form.get("defaultCurrency") || "ZAR"),
			taxEnabled: form.get("taxEnabled") === "on",
			taxRateBasisPoints: Number(form.get("taxRateBasisPoints") || 0),
			depositBasisPoints: Number(form.get("depositBasisPoints") || 0),
			quoteValidityDays: Number(form.get("quoteValidityDays") || 14),
			invoiceDueDays: Number(form.get("invoiceDueDays") || 7),
			quotePrefix: String(form.get("quotePrefix") || "Q"),
			invoicePrefix: String(form.get("invoicePrefix") || "INV"),
			operatorShortRateCents: Math.round(
				Number(form.get("operatorShortRate") || 300) * 100,
			),
			operatorLongRateCents: Math.round(
				Number(form.get("operatorLongRate") || 400) * 100,
			),
			operatorThresholdMinutes:
				Number(form.get("operatorThresholdHours") || 5) * 60,
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Settings</CardTitle>
				<CardDescription>
					Currency, document defaults and operator labour rules.
				</CardDescription>
			</CardHeader>
			<form className="border-t p-5" onSubmit={submit}>
				<FieldGroup className="grid gap-3 md:grid-cols-4">
					<Field>
						<FieldLabel>Currency</FieldLabel>
						<Input
							name="defaultCurrency"
							defaultValue={settings.defaultCurrency}
							maxLength={3}
						/>
					</Field>
					<Field>
						<FieldLabel>Quote prefix</FieldLabel>
						<Input name="quotePrefix" defaultValue={settings.quotePrefix} />
					</Field>
					<Field>
						<FieldLabel>Invoice prefix</FieldLabel>
						<Input name="invoicePrefix" defaultValue={settings.invoicePrefix} />
					</Field>
					<Field>
						<FieldLabel>Deposit bps</FieldLabel>
						<Input
							name="depositBasisPoints"
							type="number"
							min="0"
							max="10000"
							defaultValue={settings.depositBasisPoints}
						/>
					</Field>
					<Field>
						<FieldLabel>Quote validity days</FieldLabel>
						<Input
							name="quoteValidityDays"
							type="number"
							min="1"
							defaultValue={settings.quoteValidityDays}
						/>
					</Field>
					<Field>
						<FieldLabel>Invoice due days</FieldLabel>
						<Input
							name="invoiceDueDays"
							type="number"
							min="0"
							defaultValue={settings.invoiceDueDays}
						/>
					</Field>
					<Field>
						<FieldLabel>Tax bps</FieldLabel>
						<Input
							name="taxRateBasisPoints"
							type="number"
							min="0"
							max="10000"
							defaultValue={settings.taxRateBasisPoints}
						/>
					</Field>
					<Field>
						<FieldLabel>Tax enabled</FieldLabel>
						<label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
							<input
								name="taxEnabled"
								type="checkbox"
								defaultChecked={settings.taxEnabled}
							/>
							Enabled
						</label>
					</Field>
					<Field>
						<FieldLabel>Short operator fee</FieldLabel>
						<Input
							name="operatorShortRate"
							type="number"
							min="0"
							step="0.01"
							defaultValue={settings.operatorRule.shortRateCents / 100}
						/>
					</Field>
					<Field>
						<FieldLabel>Long operator fee</FieldLabel>
						<Input
							name="operatorLongRate"
							type="number"
							min="0"
							step="0.01"
							defaultValue={settings.operatorRule.longRateCents / 100}
						/>
					</Field>
					<Field>
						<FieldLabel>Long event hours</FieldLabel>
						<Input
							name="operatorThresholdHours"
							type="number"
							min="1"
							step="0.25"
							defaultValue={settings.operatorRule.longThresholdMinutes / 60}
						/>
					</Field>
					<div className="flex items-end justify-end">
						<Button type="submit" disabled={pending}>
							Save settings
						</Button>
					</div>
				</FieldGroup>
			</form>
		</Card>
	);
}

export function QuotesView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const quotes = useQuery(trpc.finance.quotes.queryOptions({}));
	const [draft, setDraft] = useState({ title: "", amount: "" });
	const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
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
	const updateQuote = useMutation(
		trpc.finance.updateQuote.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				setSelectedQuoteId(result.quote.id);
				toast.success("Quote saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const duplicateQuote = useMutation(
		trpc.finance.duplicateQuote.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				setSelectedQuoteId(result.quote.id);
				toast.success("Quote duplicated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateStatus = useMutation(
		trpc.finance.updateQuoteStatus.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Quote updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const convertQuote = useMutation(
		trpc.finance.convertQuoteToInvoice.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Invoice created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const generateDocument = useMutation(
		trpc.finance.generateQuoteDocument.mutationOptions({
			onSuccess: (document) => {
				window.open(document.documentUrl, "_blank", "noopener,noreferrer");
				toast.success("Quote PDF opened.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const quoteRows = quotes.data?.quotes ?? [];
	const selectedQuote =
		quoteRows.find((quote) => quote.id === selectedQuoteId) ??
		quoteRows[0] ??
		null;

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
		<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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
					<SimpleTable columns={DOCUMENT_COLUMNS}>
						{quoteRows.map((quote) => (
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
								<TableCell className={CELL}>
									<div className="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="xs"
											onClick={() => setSelectedQuoteId(quote.id)}
										>
											Open
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={duplicateQuote.isPending}
											onClick={() => duplicateQuote.mutate({ id: quote.id })}
										>
											Duplicate
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={updateStatus.isPending}
											onClick={() =>
												updateStatus.mutate({ id: quote.id, status: "SENT" })
											}
										>
											Send
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={
												convertQuote.isPending || quote.status !== "ACCEPTED"
											}
											onClick={() => convertQuote.mutate({ id: quote.id })}
										>
											Invoice
										</Button>
									</div>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</FinanceListShell>
			<QuoteDetailPanel
				quote={selectedQuote}
				pending={
					updateQuote.isPending ||
					updateStatus.isPending ||
					convertQuote.isPending ||
					generateDocument.isPending
				}
				onSave={(input) => updateQuote.mutate(input)}
				onStatus={(id, status) => updateStatus.mutate({ id, status })}
				onConvert={(id) => convertQuote.mutate({ id })}
				onPdf={(id) => generateDocument.mutate({ id })}
			/>
		</div>
	);
}

function QuoteDetailPanel({
	quote,
	pending,
	onSave,
	onStatus,
	onConvert,
	onPdf,
}: {
	quote: QuoteRecord | null;
	pending: boolean;
	onSave: (input: {
		id: string;
		title: string;
		service?: string;
		eventDate?: string;
		currency: string;
		validUntil?: string;
		notes?: string;
		terms?: string;
		travelFeeCents: number;
		discountCents: number;
		depositCents: number;
		lineItems: {
			description: string;
			quantity: number;
			unitAmountCents: number;
			discountCents: number;
		}[];
	}) => void;
	onStatus: (
		id: string,
		status: "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "ARCHIVED" | "VOID",
	) => void;
	onConvert: (id: string) => void;
	onPdf: (id: string) => void;
}) {
	if (!quote) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Quote Detail</CardTitle>
					<CardDescription>No quote selected.</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	const activeQuote = quote;

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const lineItems = parseLineItems(String(form.get("lineItems") || ""));
		if (lineItems.length === 0) {
			toast.error("Enter at least one line item.");
			return;
		}
		onSave({
			id: activeQuote.id,
			title: String(form.get("title") || activeQuote.title),
			service: optionalString(form.get("service")),
			eventDate: optionalString(form.get("eventDate")),
			currency: String(form.get("currency") || activeQuote.currency),
			validUntil: optionalString(form.get("validUntil")),
			notes: optionalString(form.get("notes")),
			terms: optionalString(form.get("terms")),
			travelFeeCents: moneyField(form.get("travelFee")),
			discountCents: moneyField(form.get("discount")),
			depositCents: moneyField(form.get("deposit")),
			lineItems,
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{activeQuote.number}</CardTitle>
				<CardDescription>
					{activeQuote.status} ·{" "}
					{formatMoney(activeQuote.totalCents, activeQuote.currency)}
				</CardDescription>
			</CardHeader>
			<form className="grid gap-4 border-t p-5" onSubmit={submit}>
				<FieldGroup className="grid gap-3">
					<Field>
						<FieldLabel>Title</FieldLabel>
						<Input name="title" defaultValue={activeQuote.title} />
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel>Service</FieldLabel>
							<Input name="service" defaultValue={activeQuote.service ?? ""} />
						</Field>
						<Field>
							<FieldLabel>Currency</FieldLabel>
							<Input name="currency" defaultValue={activeQuote.currency} />
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel>Event date</FieldLabel>
							<Input
								name="eventDate"
								type="date"
								defaultValue={activeQuote.eventDate ?? ""}
							/>
						</Field>
						<Field>
							<FieldLabel>Valid until</FieldLabel>
							<Input
								name="validUntil"
								type="date"
								defaultValue={activeQuote.validUntil ?? ""}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel>Line items</FieldLabel>
						<Textarea
							name="lineItems"
							className="min-h-32 font-mono text-xs"
							defaultValue={formatLineItems(activeQuote.lineItems)}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-3">
						<Field>
							<FieldLabel>Travel</FieldLabel>
							<Input
								name="travelFee"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeQuote.travelFeeCents / 100}
							/>
						</Field>
						<Field>
							<FieldLabel>Discount</FieldLabel>
							<Input
								name="discount"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeQuote.discountCents / 100}
							/>
						</Field>
						<Field>
							<FieldLabel>Deposit</FieldLabel>
							<Input
								name="deposit"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeQuote.depositCents / 100}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel>Notes</FieldLabel>
						<Textarea name="notes" defaultValue={activeQuote.notes ?? ""} />
					</Field>
					<Field>
						<FieldLabel>Terms</FieldLabel>
						<Textarea name="terms" defaultValue={activeQuote.terms ?? ""} />
					</Field>
				</FieldGroup>
				<div className="grid grid-cols-2 gap-2">
					<Button type="submit" disabled={pending}>
						Save
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onPdf(activeQuote.id)}
					>
						PDF
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeQuote.id, "SENT")}
					>
						Send
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeQuote.id, "ACCEPTED")}
					>
						Accept
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeQuote.id, "DECLINED")}
					>
						Reject
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeQuote.id, "EXPIRED")}
					>
						Expire
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeQuote.id, "ARCHIVED")}
					>
						Archive
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending || activeQuote.status !== "ACCEPTED"}
						onClick={() => onConvert(activeQuote.id)}
					>
						Invoice
					</Button>
				</div>
				<div className="grid gap-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Subtotal</span>
						<span>
							{formatMoney(activeQuote.subtotalCents, activeQuote.currency)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Tax</span>
						<span>
							{formatMoney(activeQuote.taxCents, activeQuote.currency)}
						</span>
					</div>
					<div className="flex justify-between font-medium">
						<span>Total</span>
						<span>
							{formatMoney(activeQuote.totalCents, activeQuote.currency)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Balance</span>
						<span>
							{formatMoney(activeQuote.balanceCents, activeQuote.currency)}
						</span>
					</div>
				</div>
			</form>
		</Card>
	);
}

export function InvoicesView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const invoices = useQuery(trpc.finance.invoices.queryOptions({}));
	const [draft, setDraft] = useState({ title: "", amount: "" });
	const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
		null,
	);
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
	const updateInvoice = useMutation(
		trpc.finance.updateInvoice.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				setSelectedInvoiceId(result.invoice.id);
				toast.success("Invoice saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateStatus = useMutation(
		trpc.finance.updateInvoiceStatus.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Invoice updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const generateDocument = useMutation(
		trpc.finance.generateInvoiceDocument.mutationOptions({
			onSuccess: (document) => {
				window.open(document.documentUrl, "_blank", "noopener,noreferrer");
				toast.success("Invoice PDF opened.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const invoiceRows = invoices.data?.invoices ?? [];
	const selectedInvoice =
		invoiceRows.find((invoice) => invoice.id === selectedInvoiceId) ??
		invoiceRows[0] ??
		null;

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
		<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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
					<SimpleTable columns={DOCUMENT_COLUMNS}>
						{invoiceRows.map((invoice) => (
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
								<TableCell className={CELL}>
									<div className="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="xs"
											onClick={() => setSelectedInvoiceId(invoice.id)}
										>
											Open
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={updateStatus.isPending}
											onClick={() =>
												updateStatus.mutate({
													id: invoice.id,
													status: "SENT",
												})
											}
										>
											Send
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={updateStatus.isPending}
											onClick={() =>
												updateStatus.mutate({
													id: invoice.id,
													status: "VOID",
												})
											}
										>
											Void
										</Button>
										<Button
											variant="outline"
											size="xs"
											disabled={generateDocument.isPending}
											onClick={() =>
												generateDocument.mutate({ id: invoice.id })
											}
										>
											PDF
										</Button>
									</div>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</FinanceListShell>
			<InvoiceDetailPanel
				invoice={selectedInvoice}
				pending={
					updateInvoice.isPending ||
					updateStatus.isPending ||
					generateDocument.isPending
				}
				onSave={(input) => updateInvoice.mutate(input)}
				onStatus={(id, status) => updateStatus.mutate({ id, status })}
				onPdf={(id) => generateDocument.mutate({ id })}
			/>
		</div>
	);
}

function InvoiceDetailPanel({
	invoice,
	pending,
	onSave,
	onStatus,
	onPdf,
}: {
	invoice: InvoiceRecord | null;
	pending: boolean;
	onSave: (input: {
		id: string;
		title: string;
		service?: string;
		eventDate?: string;
		currency: string;
		issueDate: string;
		dueDate?: string;
		notes?: string;
		terms?: string;
		travelFeeCents: number;
		discountCents: number;
		depositRequiredCents: number;
		paymentReference?: string;
		lineItems: {
			description: string;
			quantity: number;
			unitAmountCents: number;
			discountCents: number;
		}[];
	}) => void;
	onStatus: (
		id: string,
		status: "SENT" | "OVERDUE" | "CANCELLED" | "VOID",
	) => void;
	onPdf: (id: string) => void;
}) {
	if (!invoice) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Invoice Detail</CardTitle>
					<CardDescription>No invoice selected.</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	const activeInvoice = invoice;

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const lineItems = parseLineItems(String(form.get("lineItems") || ""));
		if (lineItems.length === 0) {
			toast.error("Enter at least one line item.");
			return;
		}
		onSave({
			id: activeInvoice.id,
			title: String(form.get("title") || activeInvoice.title),
			service: optionalString(form.get("service")),
			eventDate: optionalString(form.get("eventDate")),
			currency: String(form.get("currency") || activeInvoice.currency),
			issueDate: String(form.get("issueDate") || activeInvoice.issueDate),
			dueDate: optionalString(form.get("dueDate")),
			notes: optionalString(form.get("notes")),
			terms: optionalString(form.get("terms")),
			travelFeeCents: moneyField(form.get("travelFee")),
			discountCents: moneyField(form.get("discount")),
			depositRequiredCents: moneyField(form.get("deposit")),
			paymentReference: optionalString(form.get("paymentReference")),
			lineItems,
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{activeInvoice.number}</CardTitle>
				<CardDescription>
					{activeInvoice.status} ·{" "}
					{formatMoney(activeInvoice.balanceCents, activeInvoice.currency)} due
				</CardDescription>
			</CardHeader>
			<form className="grid gap-4 border-t p-5" onSubmit={submit}>
				<FieldGroup className="grid gap-3">
					<Field>
						<FieldLabel>Title</FieldLabel>
						<Input name="title" defaultValue={activeInvoice.title} />
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel>Service</FieldLabel>
							<Input
								name="service"
								defaultValue={activeInvoice.service ?? ""}
							/>
						</Field>
						<Field>
							<FieldLabel>Currency</FieldLabel>
							<Input name="currency" defaultValue={activeInvoice.currency} />
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<Field>
							<FieldLabel>Event date</FieldLabel>
							<Input
								name="eventDate"
								type="date"
								defaultValue={activeInvoice.eventDate ?? ""}
							/>
						</Field>
						<Field>
							<FieldLabel>Issue date</FieldLabel>
							<Input
								name="issueDate"
								type="date"
								defaultValue={activeInvoice.issueDate}
							/>
						</Field>
						<Field>
							<FieldLabel>Due date</FieldLabel>
							<Input
								name="dueDate"
								type="date"
								defaultValue={activeInvoice.dueDate ?? ""}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel>Line items</FieldLabel>
						<Textarea
							name="lineItems"
							className="min-h-32 font-mono text-xs"
							defaultValue={formatLineItems(activeInvoice.lineItems)}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-3">
						<Field>
							<FieldLabel>Travel</FieldLabel>
							<Input
								name="travelFee"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeInvoice.travelFeeCents / 100}
							/>
						</Field>
						<Field>
							<FieldLabel>Discount</FieldLabel>
							<Input
								name="discount"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeInvoice.discountCents / 100}
							/>
						</Field>
						<Field>
							<FieldLabel>Deposit</FieldLabel>
							<Input
								name="deposit"
								type="number"
								min="0"
								step="0.01"
								defaultValue={activeInvoice.depositRequiredCents / 100}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel>Payment reference</FieldLabel>
						<Input
							name="paymentReference"
							defaultValue={activeInvoice.paymentReference ?? ""}
						/>
					</Field>
					<Field>
						<FieldLabel>Notes</FieldLabel>
						<Textarea name="notes" defaultValue={activeInvoice.notes ?? ""} />
					</Field>
					<Field>
						<FieldLabel>Terms</FieldLabel>
						<Textarea name="terms" defaultValue={activeInvoice.terms ?? ""} />
					</Field>
				</FieldGroup>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="submit"
						disabled={pending || activeInvoice.status !== "DRAFT"}
					>
						Save draft
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onPdf(activeInvoice.id)}
					>
						PDF
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeInvoice.id, "SENT")}
					>
						Send
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeInvoice.id, "OVERDUE")}
					>
						Overdue
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeInvoice.id, "CANCELLED")}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onStatus(activeInvoice.id, "VOID")}
					>
						Void
					</Button>
				</div>
				<div className="grid gap-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Total</span>
						<span>
							{formatMoney(activeInvoice.totalCents, activeInvoice.currency)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Paid</span>
						<span>
							{formatMoney(activeInvoice.paidCents, activeInvoice.currency)}
						</span>
					</div>
					<div className="flex justify-between font-medium">
						<span>Outstanding</span>
						<span>
							{formatMoney(activeInvoice.balanceCents, activeInvoice.currency)}
						</span>
					</div>
				</div>
			</form>
		</Card>
	);
}

export function PaymentsView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const payments = useQuery(trpc.finance.payments.queryOptions({}));
	const invoices = useQuery(trpc.finance.invoices.queryOptions({}));
	const [draft, setDraft] = useState({ payer: "", amount: "", reference: "" });
	const [paymentMatch, setPaymentMatch] = useState({
		paymentId: "",
		invoiceId: "",
	});
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
	const matchPayment = useMutation(
		trpc.finance.matchPayment.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setPaymentMatch({ paymentId: "", invoiceId: "" });
				toast.success("Payment matched.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateStatus = useMutation(
		trpc.finance.updatePaymentStatus.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Payment updated.");
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

	function submitMatch(invoiceId: string | null) {
		if (!paymentMatch.paymentId) {
			toast.error("Select a payment.");
			return;
		}
		matchPayment.mutate({ id: paymentMatch.paymentId, invoiceId });
	}

	return (
		<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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
									setDraft((value) => ({
										...value,
										payer: event.target.value,
									}))
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
									setDraft((value) => ({
										...value,
										amount: event.target.value,
									}))
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
								<TableCell className={CELL}>
									<div className="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="xs"
											onClick={() =>
												setPaymentMatch({
													paymentId: payment.id,
													invoiceId: payment.invoice?.id ?? "",
												})
											}
										>
											Match
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={updateStatus.isPending}
											onClick={() =>
												updateStatus.mutate({
													id: payment.id,
													status: "CONFIRMED",
												})
											}
										>
											Confirm
										</Button>
										<Button
											variant="ghost"
											size="xs"
											disabled={updateStatus.isPending}
											onClick={() =>
												updateStatus.mutate({
													id: payment.id,
													status: "FAILED",
												})
											}
										>
											Fail
										</Button>
									</div>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</FinanceListShell>
			<PaymentMatchPanel
				payments={payments.data?.payments ?? []}
				invoices={invoices.data?.invoices ?? []}
				value={paymentMatch}
				pending={matchPayment.isPending}
				onPayment={(paymentId) =>
					setPaymentMatch((value) => ({ ...value, paymentId }))
				}
				onInvoice={(invoiceId) =>
					setPaymentMatch((value) => ({ ...value, invoiceId }))
				}
				onMatch={() => submitMatch(paymentMatch.invoiceId || null)}
				onUnmatch={() => submitMatch(null)}
			/>
		</div>
	);
}

function PaymentMatchPanel({
	payments,
	invoices,
	value,
	pending,
	onPayment,
	onInvoice,
	onMatch,
	onUnmatch,
}: {
	payments: PaymentRecord[];
	invoices: InvoiceRecord[];
	value: { paymentId: string; invoiceId: string };
	pending: boolean;
	onPayment: (paymentId: string) => void;
	onInvoice: (invoiceId: string) => void;
	onMatch: () => void;
	onUnmatch: () => void;
}) {
	const payment = payments.find((row) => row.id === value.paymentId) ?? null;
	const invoice = invoices.find((row) => row.id === value.invoiceId) ?? null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment Matching</CardTitle>
				<CardDescription>
					Link unmatched payments to confirmed invoices.
				</CardDescription>
			</CardHeader>
			<div className="grid gap-4 border-t p-5">
				<FieldGroup className="grid gap-3">
					<Field>
						<FieldLabel>Payment</FieldLabel>
						<Select value={value.paymentId} onValueChange={onPayment}>
							<SelectTrigger>
								<SelectValue placeholder="Select payment" />
							</SelectTrigger>
							<SelectContent>
								{payments.map((row) => (
									<SelectItem key={row.id} value={row.id}>
										{row.payerName ?? row.reference ?? row.id} ·{" "}
										{formatMoney(row.amountCents, row.currency)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel>Invoice</FieldLabel>
						<Select value={value.invoiceId} onValueChange={onInvoice}>
							<SelectTrigger>
								<SelectValue placeholder="Select invoice" />
							</SelectTrigger>
							<SelectContent>
								{invoices.map((row) => (
									<SelectItem key={row.id} value={row.id}>
										{row.number} · {formatMoney(row.balanceCents, row.currency)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</FieldGroup>
				<div className="grid gap-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Payment status</span>
						<span>{payment?.status ?? "None"}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Payment amount</span>
						<span>
							{payment
								? formatMoney(payment.amountCents, payment.currency)
								: "None"}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Invoice balance</span>
						<span>
							{invoice
								? formatMoney(invoice.balanceCents, invoice.currency)
								: "None"}
						</span>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button disabled={pending || !value.paymentId} onClick={onMatch}>
						Match
					</Button>
					<Button
						variant="outline"
						disabled={pending || !value.paymentId}
						onClick={onUnmatch}
					>
						Unmatch
					</Button>
				</div>
			</div>
		</Card>
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
		<div className="flex min-w-0 flex-col gap-6">
			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<div className="border-t p-5">{form}</div>
			</Card>
			<Card className="min-w-0 overflow-hidden">{children}</Card>
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
		<FieldGroup className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
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
			<Button
				className="w-full md:w-auto md:self-end"
				onClick={onSubmit}
				disabled={pending}
			>
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

function moneyField(value: FormDataEntryValue | null): number {
	const amount = Number.parseFloat(String(value ?? ""));
	return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
	const trimmed = String(value ?? "").trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function formatLineItems(
	lines: {
		description: string;
		quantity: number;
		unitAmountCents: number;
		discountCents: number;
	}[],
): string {
	return lines
		.map((line) =>
			[
				line.description,
				String(line.quantity),
				String(line.unitAmountCents / 100),
				String(line.discountCents / 100),
			].join(" | "),
		)
		.join("\n");
}

function parseLineItems(value: string): {
	description: string;
	quantity: number;
	unitAmountCents: number;
	discountCents: number;
}[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [description, quantity, unitAmount, discount] = line
				.split("|")
				.map((part) => part.trim());
			const descriptionText = description ?? "";
			const quantityNumber = Number.parseInt(quantity ?? "1", 10);
			const unitAmountCents = moneyField(unitAmount ?? null);
			return {
				description: descriptionText,
				quantity:
					Number.isFinite(quantityNumber) && quantityNumber > 0
						? quantityNumber
						: 1,
				unitAmountCents,
				discountCents: moneyField(discount ?? null),
			};
		})
		.filter((line) => line.description.length > 0 && line.unitAmountCents >= 0);
}
