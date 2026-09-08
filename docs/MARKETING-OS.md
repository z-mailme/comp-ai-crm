# Marketing OS

Date: 2026-09-06.

Status: architecture only. No campaign UI, migration, ad write, or marketing send is added in this change.

Sources: [listmonk](https://listmonk.app/), [listmonk campaign API](https://listmonk.app/docs/apis/campaigns/), [Canva Connect APIs](https://www.canva.dev/docs/connect/), [Google Ads API](https://developers.google.com/google-ads/api), and [Meta Marketing API](https://developers.facebook.com/social-technologies/marketing-api/).

## Core Concept

`MarketingCampaign` becomes the owner-facing plan.

It coordinates:

- BusinessUnit
- objective
- offer
- audience
- copy
- creative assets
- channels
- budget
- schedule
- approvals
- performance
- leads
- deals
- bookings
- revenue

## Channel Engines

| Channel | Execution engine | Comp AI role |
| --- | --- | --- |
| Email marketing | Listmonk | Audience builder, draft campaign, approval, send control, metrics import |
| Creative | Canva | Brief, template selection, export tracking, approval |
| Google Ads | Google Ads API | Read reporting, propose changes, approved writes later |
| Meta Ads | Meta Marketing API | Read reporting, propose changes, approved writes later |
| Website | Existing tracking collector | Lead attribution and source events |
| WhatsApp | Future provider | Customer conversations and opt-in campaigns |

## Pipeline

Campaign -> Audience -> AI brief -> Copy -> Creative -> Approval -> Channels -> Performance -> Leads -> Deals -> Bookings -> Revenue.

## Listmonk

Listmonk provides lists, subscribers, campaigns, templates, test sends, status changes, analytics, bounces, and transactional API coverage.

Comp AI must not rebuild bulk email sending.

Comp AI should:

- Store Listmonk connection settings.
- Sync list and campaign metadata.
- Build CRM audiences.
- Respect unsubscribe and consent state.
- Create test campaigns.
- Require approval before send.
- Import open, click, bounce, and unsubscribe metrics.

Do not re-add unsubscribed recipients automatically.

## Canva

Canva Connect APIs support assets, designs, exports, brand templates, autofill, folders, comments, resizes, and webhooks. Canva marks some APIs as preview. Preview APIs are not production-safe.

Comp AI should:

- Store Canva account connection state.
- Create a creative brief.
- Open or create Canva designs where API access permits.
- Upload source assets.
- Export approved assets.
- Link exported files to campaigns.
- Track versions and approval status.

Do not duplicate Canva's editor.

## Google Ads

The Google Ads API supports guides, reference, reporting, and campaign management resources.

Comp AI should read:

- account
- campaign
- ad group
- ad
- asset
- budget
- targeting
- spend
- impressions
- clicks
- CTR
- CPC
- conversions
- conversion value

Writes require ApprovalRequest first.

Guardrails:

- max daily budget increase
- max percentage change
- require approval above threshold
- BusinessUnit spend limit
- global ads kill switch

## Meta Ads

The Meta Marketing API supports ad accounts, campaigns, ad sets, ads, creatives, audiences, and insights.

Comp AI should read campaign and ad performance first.

Writes require ApprovalRequest first.

Canva exports become creative inputs after approval.

## Attribution

Use the existing tracking system as the first attribution source.

Preserve:

- source
- medium
- campaign
- content
- term
- provider campaign id
- provider ad set id
- provider ad id
- click id where legal and available

Compute revenue attribution from real Comp AI records:

Ad -> Lead -> Conversation -> Contact -> Deal -> Booking -> Payment -> Revenue.

Do not rely only on platform-reported leads.

## BusinessEvents

- `marketing.campaign.created`
- `marketing.campaign.approved`
- `marketing.email.sent`
- `marketing.email.opened`
- `marketing.email.clicked`
- `marketing.email.bounced`
- `marketing.email.unsubscribed`
- `marketing.ad.created`
- `marketing.ad.paused`
- `marketing.ad.budget_change_requested`
- `marketing.lead_generated`
- `marketing.campaign.completed`

Aggregate noisy tracking events before writing high-volume BusinessEvents.
