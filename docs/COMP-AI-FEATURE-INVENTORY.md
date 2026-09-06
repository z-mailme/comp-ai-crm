# Comp AI Feature Inventory

Date: 2026-09-06.

Scope: current fork, fetched `upstream/release`, and fetched `upstream/main`.

Upstream status: this branch contains `upstream/release` at `6d4793d` and `upstream/main` at `3c3e07a`. No stable upstream release or main feature is missing from this branch. Non-main upstream branches exist. Treat them as experimental until they merge.

Sources: local route, router, schema, and agent files. Public upstream source: [trycompai/crm](https://github.com/trycompai/crm).

## Live And Navigable

| Feature | Surface | Source | Notes |
| --- | --- | --- | --- |
| Overview dashboard | `/{slug}` | Fork and upstream | Shows dashboard summary with scope control. |
| Unified Inbox | `/{slug}/inbox` | Fork Business OS | Uses `businessOs.inbox`. |
| Command Centre | `/{slug}/command` | Fork Business OS | Shows conversations, approvals, events, knowledge, and outbox state. |
| Agent Chat | `/{slug}/chat` | Upstream | Durable agent chat route. |
| Agent Builder | `/{slug}/agents` | Upstream | Includes builder chat, versions, files, runs, and agent controls. |
| Companies | `/{slug}/companies` | Upstream | Table, bulk actions, details, fields, timeline, enrichment, and agent tab. |
| Contacts | `/{slug}/contacts` | Upstream | Table, bulk actions, details, fields, social links, timeline, and agent tab. |
| Deals | `/{slug}/deals` | Upstream plus fork booking fields | Table, detail, stage changes, statuses, amount, currency, and booking relation. |
| General settings | `/{slug}/settings` | Upstream | Workspace profile, research key, archive retention, and agent model. |
| Tracking settings | `/{slug}/settings/tracking` | Fork and upstream | Tracking script, domains, source rules, cookies, and verification. |
| Connections | `/{slug}/settings/connections` | Upstream plus fork | Google, Microsoft, Slack, and intake pages. |
| Currency settings | `/{slug}/settings/currencies` | Upstream | Reporting currency and manual exchange rates. |
| Members | `/{slug}/settings/members` | Upstream | Workspace member administration. |
| API Keys | `/{slug}/settings/api-keys` | Upstream | API key creation and table. |
| SSO | `/{slug}/settings/sso` | Upstream | Identity provider settings. |

## Live But Hidden Or Hard To Discover

| Feature | Surface | Status | Notes |
| --- | --- | --- | --- |
| Google historical import jobs | Google settings and API | Live | Resume, pause, cancel, status, chunking, and verification exist. |
| Google event detail | `google.event` | Backend detail only | Requires an event id. No list route exists. |
| Email thread detail | `google.thread` | Backend detail only | Used for projected mailbox threads. |
| Slack channels | Settings connection subroutes | Live | Channel picker and channel settings exist. |
| Slack people matching | Settings connection subroute | Live | Match Slack users to contacts. |
| Microsoft Outlook sync | Microsoft router and service | Backend and settings | Mail sync exists. It is not part of this Gmail fix. |
| Archive retention | General settings | Live | It is not in its own settings nav item. |
| Saved views | Table menus and router | Live | Shared table feature. |
| Dynamic fields | Record fields and fields router | Live | Company, contact, and deal fields. |
| Website activity | Record components and tracking router | Live | Fed by tracking collector. |

## Backend Exists, UI Missing

| Feature | Backend | Gap |
| --- | --- | --- |
| Calendar list view | `CalendarEvent`, `CalendarAttendee`, `CalendarSyncService` | No `/{slug}/calendar` route. No list query. |
| Business OS conversation detail | `businessOs.conversation` | No dedicated route or drawer. |
| Customer 360 | `businessOs.customer360` | Contact sheet tab exists, but no full page. |
| Global Search | `businessOs.globalSearch` and `search.router` | No top-level search experience. |
| Approvals | `ApprovalRequest` and `businessOs.approvals` | Visible only in Command Centre summary. |
| Knowledge | `KnowledgeItem`, `KnowledgeVersion`, `BusinessRule` | Visible only in Command Centre summary. |
| Automations | `AutomationRule`, `AutomationExecution` | No builder UI. |
| BusinessEvent outbox | `BusinessEventOutbox` | No delivery worker beyond persisted outbox rows. |
| Booking lifecycle API | `bookings.controller` and `bookings.service` | Internal API only. |
| Booking capacity | `BookingResourceCapacity` | Internal API only. No operator/equipment model. |
| Agent safety policy | `AgentSafetyPolicy` | Model exists. No management UI. |

## Partially Implemented

| Feature | Current state | Reason |
| --- | --- | --- |
| Finance | Deal has quote, invoice, payment status fields | No invoice, quote, payment, expense, or receipt records exist. |
| Booking calendar link | Booking stores `googleCalendarEventId` | No Google Calendar write path exists. |
| Calendar CRM linking | Calendar matches company and contact | No BusinessUnit key exists on `CalendarEvent`. |
| Marketing attribution | Tracking captures sources and visits | No campaign, ad, email, audience, or spend models exist. |
| Owner HQ | BusinessUnit exists | Cross-business read is explicitly disabled. |
| External memory | `ExternalMemoryLink` exists | No memory delivery worker is implemented. |

## Experimental Or Not Safe For Production

| Feature | Decision |
| --- | --- |
| Non-main upstream branches | Do not expose. Review branch contents before any merge. |
| Calendar writes | Do not enable until BusinessUnit and idempotency are complete. |
| Ads writes | Do not enable until approvals, spend limits, and kill switches are enforced. |
| Autonomous financial writes | Do not enable. Require external evidence and approval. |
| Canva preview APIs | Do not use in production. Canva marks preview APIs as unstable. |
| InvoiceShelf 3.x | Do not use with production data. Its repository labels 3.x as alpha preview. |

## Recommended To Merge Or Adapt

| Area | Recommendation |
| --- | --- |
| Calendar | Reuse existing sync service. Add BusinessUnit ownership, list APIs, and UI later. |
| Finance | Keep Comp AI as control centre. Integrate InvoiceShelf 2.x through an adapter. |
| Marketing email | Use Listmonk as execution engine. Keep consent and attribution in Comp AI. |
| Creative | Use Canva Connect where plan and API access allow it. Do not build a design editor. |
| People, assets, procurement, accounting | Prefer ERPNext or Frappe apps as systems of record. Mirror owner-facing state in Comp AI. |

## Not Relevant Now

| Feature | Reason |
| --- | --- |
| Compliance product from `trycompai/comp` | It is a different upstream project. This fork tracks `trycompai/crm`. |
| Full ERP clone inside Comp AI | Violates the system-of-record principle. |
| Full email delivery platform inside Comp AI | Listmonk already fits that execution role. |
| Full Canva editor inside Comp AI | Canva already owns editing and rendering. |
