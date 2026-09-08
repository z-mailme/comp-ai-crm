# Integrations Roadmap

Date: 2026-09-06.

Status: roadmap. No new external credential or integration write is added in this change.

## Current Integrations

| Integration | Current state | Safe next step |
| --- | --- | --- |
| Gmail | Live incremental sync and historical import | Deploy NUL sanitation fix. Resume existing failed job. |
| Google Calendar | Read-only sync backend | Add BusinessUnit key, list query, and calendar UI later. |
| Microsoft Outlook | Mail sync backend and settings | Audit for Business OS projection parity. |
| Slack | Connection, channel selection, people matching | Add BusinessEvent projection after rules exist. |
| Tracking collector | Live tracking, form submissions, source settings | Link campaign ids when Marketing OS exists. |
| Currency rates | Live settings and rates service | Keep optional provider behavior. |
| Agent bridge | Configurable | Preserve separate agent deployment. |

## Planned Engines

| Engine | Role | Source |
| --- | --- | --- |
| InvoiceShelf 2.x | Invoice, estimate, payment, expense, PDF, customer portal | [InvoiceShelf](https://github.com/InvoiceShelf/InvoiceShelf) |
| Listmonk | Bulk email campaigns and subscriber management | [listmonk](https://listmonk.app/) |
| Canva | Creative production and export | [Canva Connect APIs](https://www.canva.dev/docs/connect/) |
| Google Ads | Ads reporting and approved campaign changes | [Google Ads API](https://developers.google.com/google-ads/api) |
| Meta Ads | Facebook and Instagram ads reporting and approved changes | [Meta Marketing API](https://developers.facebook.com/social-technologies/marketing-api/) |
| Frappe HR | HR, attendance, shifts, leave, payroll | [Frappe HR](https://docs.frappe.io/hr/introduction) |
| ERPNext Accounting | Accounting, invoices, payments, ledgers, reports | [ERPNext Accounting](https://docs.frappe.io/erpnext/accounting-introduction) |
| ERPNext Assets | Assets, depreciation, maintenance, location | [ERPNext Asset](https://docs.frappe.io/erpnext/asset) |
| ERPNext Buying | Suppliers, material requests, RFQ, purchase orders | [ERPNext Buying](https://docs.frappe.io/erpnext/buying) |
| n8n | External orchestration where appropriate | Future |
| Monitoring stack | Infrastructure health aggregation | Future |

## Adapter Standard

Each adapter must expose:

- connection status
- credential health
- read sync
- write capability flags
- dry-run or preview when available
- idempotency key strategy
- BusinessUnit ownership
- audit events
- approval gate for consequential writes

## Credential Rule

All credentials are optional.

Missing credentials remove capability. Missing credentials must not crash the app.

Add variables only when code reads them.

## BusinessEvent Normalization

Every adapter maps provider changes into domain records and BusinessEvents.

High-volume systems need aggregation.

Examples:

- Listmonk opens and clicks aggregate by campaign and day.
- Ads metrics aggregate by campaign, ad set, ad, and day.
- Infrastructure metrics aggregate by service and hour.
- Email and calendar events store item-level events where volume is manageable.

## Write Safety

Initial write support is off for:

- finance
- ads
- marketing sends
- external publication
- calendar writes

Enable writes only after ApprovalRequest flows and kill switches exist.
