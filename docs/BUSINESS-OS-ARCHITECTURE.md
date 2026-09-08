# Business OS Architecture

Date: 2026-09-06.

Goal: Comp AI becomes the Business OS and AI control centre. It stays the owner UI, event backbone, AI layer, approval layer, and customer context graph.

## Principles

1. Comp AI owns customer context, work state, approvals, agents, search, analytics, and BusinessEvents.
2. Specialized engines own their deep domains.
3. External systems connect through adapters.
4. Every consequential external action starts as a proposed action.
5. BusinessUnit isolation is the default.
6. Owner HQ gets aggregate reads only through explicit owner/admin scope.
7. API services store deterministic state only.
8. Agent reasoning stays in `apps/agent`.

## Current Backbone

The fork already has these durable Business OS models:

- `BusinessUnit`
- `ChannelAccount`
- `CustomerIdentity`
- `Conversation`
- `CommunicationMessage`
- `CommunicationParticipant`
- `ConversationInsight`
- `BusinessEvent`
- `BusinessEventOutbox`
- `ApprovalRequest`
- `KnowledgeItem`
- `KnowledgeVersion`
- `BusinessRule`
- `BusinessTask`
- `AutomationRule`
- `AutomationExecution`
- `ExternalMemoryLink`
- `AgentSafetyPolicy`

Email now flows through `ThreadWriterService.store` into `EmailThread`, `EmailMessage`, `Activity`, `Conversation`, `CommunicationMessage`, `BusinessEvent`, and `BusinessEventOutbox`.

Calendar currently reads the primary Google Calendar only. It persists Google events before CRM matching. CRM links, booking links, deal links, conversation links, and meeting prep are enrichment steps after storage.

## Target Integration Shape

External provider -> integration account -> domain record -> BusinessEvent -> CRM state -> agent run -> approval -> audited action -> memory -> analytics.

Do not force non-conversation records into `Conversation`. Invoices, assets, ads, and payroll use domain records and BusinessEvents.

## Target Domains

| Domain | Comp AI role | System of record |
| --- | --- | --- |
| Communications | Unified inbox, history, reply workflow, routing | Gmail, Outlook, Slack, future WhatsApp and Telegram |
| CRM | Customers, companies, deals, relationships | Comp AI |
| Calendar | Owner view, booking links, capacity overlays | Google Calendar plus Comp AI booking state |
| Finance | Workflow, approvals, CRM links, revenue events | InvoiceShelf 2.x now, ERPNext later if accounting expands |
| Marketing | Campaign control, attribution, approvals, AI briefs | Comp AI plus Listmonk, Canva, Google Ads, Meta |
| People | Owner view, staffing links, approval workflows | Frappe HR or ERPNext HR |
| Assets | Equipment view, booking allocation, history | ERPNext Assets or a later dedicated asset module |
| Procurement | Requests, approvals, supplier context | ERPNext Buying or selected finance backend |
| Documents | Contextual index, classification, links, retention | Comp AI metadata plus storage provider |
| Operations | Jobs, checklists, dispatch, incidents | Comp AI, then ERPNext projects if required |
| Analytics | Metric layer and owner reporting | Comp AI warehouse views over source records |
| System Health | Integration health and safety controls | Existing monitoring tools plus Comp AI health records |
| Owner HQ | Cross-business overview | Comp AI aggregate read model |

## End State Map

```text
Owner HQ
  -> Business OS
    -> Communications
    -> CRM
    -> Operations
    -> Finance
    -> Marketing
    -> People
    -> Assets
    -> Procurement
    -> Documents
    -> BusinessEvents
      -> Automations
      -> AI Agents
      -> Analytics
      -> Approvals
      -> Memory
```

## Navigation Direction

Expose real surfaces and documented capability pages.

Current grouped nav includes:

- Home: Overview, Command
- Communication: Inbox, Calendar
- CRM: Companies, Contacts, Deals, Bookings, Activity
- Finance: Quotes, Invoices, Payments, Expenses, Reports
- Marketing: Overview, Email, Google Ads, Meta Ads, Audiences
- AI: Chat, Agents, Approvals, Knowledge, Automations, Observability
- Operations: Operations, People, Assets, Procurement, Documents
- Analytics: Tracking, Business Analytics, Reports
- Admin: Settings, Connections, provider setup, Members, API Keys, Currencies, SSO, System Health

Architecture-only modules route to a coming soon page. The page shows no fake records, totals, or charts.

## BusinessEvent Taxonomy

Use namespaced types.

- `communication.message.received`
- `calendar.event.created`
- `calendar.event.updated`
- `calendar.event.cancelled`
- `quote.created`
- `invoice.sent`
- `payment.deposit_received`
- `marketing.email.sent`
- `marketing.ad.spend_changed`
- `operations.job.completed`
- `people.shift.assigned`
- `asset.reserved`
- `procurement.request.approved`
- `document.classified`
- `system.integration.failed`

Every event needs source, occurred time, domain links, correlation id, and idempotency key where replay is possible.

## Approval And Safety

Low risk work can become automatic after policies exist.

Medium risk work needs configured rules.

High risk work needs approval first.

High risk examples:

- Send a marketing campaign.
- Change ad budget.
- Send a customer reply.
- Confirm money received.
- Issue a refund.
- Delete important data.
- Change safety settings.

Kill switches must cover AI actions, outbound replies, marketing sends, ad writes, financial writes, automations, and memory writes.

## Production Deployment Sequence

1. Review the commit diff.
2. Confirm no schema migration exists in this change.
3. Deploy API and app from the committed branch.
4. Run Prisma deploy as usual for the target environment.
5. Keep production Google OAuth credentials unchanged.
6. Open Google connection settings.
7. Confirm Gmail sync and the historical import job still show the same job.
8. Resume the failed Gmail historical import job.
9. Let the scheduled tick process the current failed chunk.
10. Watch API logs for `Gmail message persistence failed`.
11. Confirm counters move forward.
12. Confirm no duplicate `EmailMessage` rows appear for already-stored Gmail ids.

## Resume Existing Historical Import Job

1. Do not create a new historical import.
2. Do not delete the failed job.
3. Do not purge Gmail data.
4. Open the existing Gmail historical import job in Google settings.
5. Press Resume on that job.
6. Let the worker process the same failed chunk.
7. Confirm `alreadyStoredMessages` stays near the previous count.
8. Confirm `writtenMessages` increases only for missing messages.
9. Confirm `remainingMessages` decreases.
10. Confirm final verification completes all chunks.

## Validation Checklist

- API starts with the existing root `.env`.
- Google status loads.
- Gmail incremental sync still settles its cursor.
- Historical import job id is unchanged.
- Failed chunk id is unchanged or requeued by Resume.
- Logs include Gmail message id and thread id on persistence failures.
- Logs do not include full email body content.
- Emails with Unicode and emoji persist.
- Emails with NUL bytes persist after sanitation.
- No duplicate thread, message, activity, conversation, or BusinessEvent rows appear after retry.
