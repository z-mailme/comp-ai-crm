# Finance OS

Date: 2026-09-06.

Status: architecture only. No Finance UI, migration, or external write is added in this change.

Sources: [InvoiceShelf repository](https://github.com/InvoiceShelf/InvoiceShelf), [InvoiceShelf docs](https://docs.invoiceshelf.com/), [InvoiceShelf API docs](https://api-docs.invoiceshelf.com/), [Invoice Ninja](https://github.com/invoiceninja/invoiceninja), [Akaunting](https://github.com/akaunting/akaunting), [InvoicePlane](https://www.invoiceplane.org/), and [SolidInvoice](https://github.com/SolidInvoice/SolidInvoice).

## Recommendation

Use InvoiceShelf 2.x as the first invoice engine.

Do not use InvoiceShelf 3.x for production data. The repository labels 3.x as alpha preview. It directs production users to the supported 2.x release.

Keep InvoiceShelf as a separate service. Do not copy its source into Comp AI.

## Engine Comparison

| Engine | Fit | License | Notes |
| --- | --- | --- | --- |
| InvoiceShelf 2.x | Recommended | AGPL-3.0 | Focused invoices, estimates, recurring invoices, payments, expenses, taxes, reports, PDF generation, customer portal, and API. |
| Invoice Ninja | Possible alternative | Source-available license | Strong product and API. Branding and source license need extra review before embedding workflows. |
| Akaunting | Not first choice | BSL | Broader accounting. License and app-store model add more coupling. |
| InvoicePlane | Not first choice | Project viability needs review | Older invoice app. Current production fit is weaker. |
| SolidInvoice | Good simple fallback | MIT | Clean license and modern 3.x work. Smaller ecosystem than InvoiceShelf. |

## Boundary

Comp AI owns:

- Customer and deal context.
- Booking context.
- Workflow.
- ApprovalRequest.
- BusinessEvents.
- AI proposals.
- Owner dashboard.
- Cross-domain links.

InvoiceShelf owns:

- Invoice numbering.
- Estimate and invoice lifecycle.
- PDF generation.
- Payment records.
- Expenses.
- Taxes.
- Customer portal.

## Integration Layer

Add a future `finance` module with:

- `InvoiceEngineConnection`
- `ExternalFinanceCustomer`
- `ExternalQuote`
- `ExternalInvoice`
- `ExternalPayment`
- `ExternalExpense`
- `FinanceDocumentLink`

Each record must carry:

- `businessUnitId`
- provider name
- provider id
- external url
- sync status
- last synced time
- local CRM links

## Linkage

Every quote, invoice, payment, and receipt must link where applicable:

- BusinessUnit
- Contact
- Company
- Deal
- Booking
- Conversation
- Document

## Workflow

Draft -> Preview -> Approve -> Send -> Viewed -> Deposit Paid -> Fully Paid.

Overdue is a derived state from due date and payment status.

AI can draft an invoice proposal. AI cannot confirm payment from an attachment alone.

## BusinessEvents

- `quote.created`
- `quote.sent`
- `quote.accepted`
- `invoice.created`
- `invoice.sent`
- `invoice.viewed`
- `invoice.overdue`
- `payment.deposit_received`
- `payment.full_received`
- `receipt.created`

Use idempotency keys from provider id plus event type.

## UI Status

Not built in this change.

Future routes:

- `/{slug}/finance/quotes`
- `/{slug}/finance/invoices`
- `/{slug}/finance/payments`
- `/{slug}/finance/expenses`
- `/{slug}/finance/reports`

Do not show these routes until provider connection, BusinessUnit scoping, and safe empty states exist.

## Environment

No new variable is added now.

Future optional variables:

- `INVOICE_ENGINE_BASE_URL`
- `INVOICE_ENGINE_API_TOKEN`

Declare them in root `.env.example` and API validation only when the API reads them.
