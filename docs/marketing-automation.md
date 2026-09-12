# Marketing Automation — n8n execution layer

Read this before touching anything under `apps/api/src/marketing` that n8n calls,
the social content lifecycle, Drive media, Canva renders, publish records, or
automation modes. Read `docs/api.md` first. Read `docs/currency.md` before
touching money.

## The one rule that governs everything here

**Comp AI is the control plane. n8n is the executor.**

Comp AI owns state, approvals, evidence, audit and reporting. n8n owns
orchestration and calls provider APIs (Google Drive, Canva, Meta, Google
Analytics). n8n never touches the database. Every write n8n needs is a
`/rest/marketing/automation/*` endpoint with an explicit Zod contract and an
idempotency key.

Do not build a second workflow engine inside Comp AI. No cron that publishes,
no queue that calls Meta. Comp AI records what n8n did and decides what n8n may
do next.

Production autopilot is **disabled** in this milestone. The default automation
mode is `APPROVAL_REQUIRED`. `FULL_AUTO` exists in the model and the audit
trail so it can be enabled later without a schema change.

## Audit — what already exists (do not rebuild)

- **Content** — `MarketingContent` with statuses `IDEA/DRAFT/READY_FOR_REVIEW/
  APPROVED/SCHEDULED/PUBLISHED/REJECTED/ARCHIVED`, full CRUD at
  `/rest/marketing/content*`, approval via `ApprovalRequest`
  (`marketing.content.review`).
- **Social** — `SocialAccount`, `SocialPost` (own status enum incl.
  `PUBLISHING`/`FAILED`, `idempotencyKey @unique`), `SocialPostTarget`,
  `SocialInteraction`, calendar feed at `/rest/marketing/social/calendar`.
  Publishing itself is not executed anywhere — n8n will do it.
- **Media** — `MarketingMediaAsset` stores binaries in Vercel Blob. Drive
  assets are a *different* contract: metadata only, no binary.
- **Approvals** — generic `ApprovalRequest` with
  `PENDING/APPROVED/REJECTED/EXPIRED/CANCELLED`, risk levels, expiry.
- **Google Analytics** — `GET /rest/google-analytics/report` with 7/28/90-day
  windows, summary + daily trend + sources + pages + devices + countries,
  cached. No comparison, no custom range, no `today`.
- **Finance** — `operator-labour.ts` already derives the R300/R400 operator
  cost from bookings (`FINANCE.operatorLabour`). `ExpenseStatus` is
  `RECORDED/NEEDS_REVIEW/CANCELLED` — no projected/confirmed/paid split yet.
- **Business Brain** — `BusinessKnowledge` rows read via `brain.knowledge`.
  No compact context contract for content generation yet.
- **WhatsApp** — webhook ingress into `BusinessEvent` already exists. Do not
  rebuild it.
- **Overview customization** — per-user layout persisted via
  `GET/PUT /rest/dashboard/layout`. Keep defaults intact.

No Google Drive or Canva scaffolding exists. Both are greenfield here.

## Data model additions

- `MarketingContentStatus` gains `PLANNED`, `MEDIA_SELECTED`, `COPY_GENERATED`,
  `DESIGN_GENERATED`, `AWAITING_APPROVAL`, `PUBLISHING`, `FAILED`, `CANCELLED`.
  The lifecycle is:

  `DRAFT → PLANNED → MEDIA_SELECTED → COPY_GENERATED → DESIGN_GENERATED →
  AWAITING_APPROVAL → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED`

  with `FAILED` and `CANCELLED` reachable from any active state. Legacy values
  stay for rows written by PR #8.
- `MarketingContent.automationMode` — nullable per-content override of the
  business-unit default. `null` means inherit.
- `BusinessUnit.settings` (existing `Json?`) holds the automation config,
  parsed at the boundary by `automationSettingsSchema` in
  `marketing/automation-settings.ts`: `mode` (`MANUAL | APPROVAL_REQUIRED |
  FULL_AUTO`, default `APPROVAL_REQUIRED`), `mediaCooldownDays` (default 14),
  `autopilotEnabled` (always `false` this milestone).
- `DriveMediaAsset` — Drive metadata only: `driveFileId` (unique per business
  unit), `fileName`, `mimeType`, `mediaKind`, `service`, `folderName`,
  `approvalState` (`PENDING/APPROVED/REJECTED`), `lastUsedAt`, `timesUsed`,
  `doNotUseUntil`. Never stores a binary.
- `DriveAssetUsage` — which content/post used an asset, and when.
- `CanvaRender` — `templateId`, `service`, `format`, `platform`,
  `sourceAssetId`, `headline`, `body`, `cta`, `renderedUrl`, `designId`,
  `status`, `error`, `idempotencyKey @unique`.
- `SocialPublishAttempt` — per-attempt record: platform, account, attempt
  number, `providerRequestId`, `externalPostId`, `externalPostUrl`, success,
  `retryCount`, `errorCategory`, `errorSummary`, `publishedAt`,
  `idempotencyKey @unique`.
- `MarketingContentMetric` — daily per-platform metrics per content item,
  upserted by `(contentId, platform, date)`.
- `MarketingAutomationAudit` — every state-changing automation call writes a
  row: actor (`user` or `n8n`), action, content, detail. This is the audit
  trail that survives even in `FULL_AUTO`.
- `ExpenseStatus` gains `PROJECTED`, `CONFIRMED`, `PAID`. Calculated operator
  labour on a future booking is `PROJECTED`; once the event date passes it
  reconciles to `CONFIRMED`. `PAID` is set only by a human.

## Endpoint contract (A–P)

All under `/rest/marketing/automation`, all authenticated, all Zod-parsed.
Write endpoints accept `idempotencyKey`; a replay returns the stored result
without re-executing. n8n sends `X-Business-Unit-Id` like any other client.

| # | Method + path | Purpose |
| --- | --- | --- |
| A | `GET /config` | Automation mode, cooldown, services, platforms, approval policy |
| B | `GET /plan` | Upcoming content plan window (from/to, status filter) |
| C | `POST /content` | Create or update a content item (upsert by id or key) |
| D | `POST /media/request` | Return media requirements + least-used eligible approved asset |
| E | `POST /media/register` | Register/update a Drive asset's metadata + approval state |
| F | `POST /content/copy` | Save generated caption/headline/CTA → `COPY_GENERATED` |
| G | `POST /design` | Save a Canva render → `DESIGN_GENERATED` |
| H | `POST /approval/send` | Create `ApprovalRequest`, status → `AWAITING_APPROVAL` |
| I | `GET /approval/status` | Read approval state for a content item |
| J | `POST /approval/decide` | Approve/reject; mode-gated (see below) |
| K | `POST /publish/result` | Record a publish attempt outcome (idempotent) |
| L | `POST /publish/post-ids` | Record external post IDs/URLs onto the post |
| M | `POST /publish/failure` | Record failure category/summary + retry count |
| N | `POST /analytics` | Upsert daily metrics for a content item |
| O | `POST /media/usage` | Record asset usage, bump `timesUsed`/`lastUsedAt` |
| P | `GET /brain-context` | Compact Business Brain context for generation |

Approval decision rules: in `MANUAL` and `APPROVAL_REQUIRED`, endpoint J only
accepts decisions from a user session, never from an unattended retry storm —
n8n reads status (I) and waits. In `FULL_AUTO` n8n may call J with
`actor: "AUTOPILOT"`; the audit row still records it. `autopilotEnabled: false`
in config makes any `FULL_AUTO` decision call fail closed this milestone.

## Media selection rules (endpoint D)

Eligible = `approvalState = APPROVED`, not archived, `doNotUseUntil` null or
past, `lastUsedAt` null or older than `mediaCooldownDays`. Among eligible
assets for the requested service, pick the least-used, ties broken by
least-recently-used. If none are eligible the response says so — n8n must not
fall back to unapproved media.

## Canva constraints (documented, not faked)

Comp AI never calls Canva. n8n will. Known constraints for the workflow
author: Canva's Connect API creates designs from templates asynchronously —
a render is a job whose result is polled or delivered later, so endpoint G
accepts `status: QUEUED/RENDERING/READY/FAILED` and may be called twice with
the same `idempotencyKey` as the render progresses. Brand template IDs and
folder structure are configured in n8n, not in Comp AI.

## Finance: projected / confirmed / paid

Operator labour rules live in `apps/api/src/finance/operator-labour.ts`:
R300 under 5 hours, R400 at 5 hours or more, per operator. The reconciliation
in `FinanceService` writes `PROJECTED` while the booking is in the future and
`CONFIRMED` once the event date has passed. Revenue comes only from deals on
actual bookings — an enquiry is never revenue. Nothing here auto-creates an
irreversible accounting entry; `PAID` is a human action.

## Business Brain context contract (endpoint P)

Compact and safe by construction: current offers and promotions
(`PROMOTION` knowledge, human-confirmed first), service/pricing knowledge,
recent booking counts by service, and upcoming availability. Never email
bodies, never mailbox dumps. Bounded by `MARKETING_AUTOMATION.brainContext`
limits in `marketing-config.ts`.

## n8n workflow map

Every workflow authenticates to Comp AI with an API key and sends
`X-Business-Unit-Id`. Retries reuse the same `idempotencyKey`.

### SOC-01 — Social Planner
- Trigger: schedule (weekly)
- Inputs: business unit, planning horizon
- Comp AI endpoints: `GET /config`, `GET /brain-context`, `GET /plan`,
  `POST /content`
- External: none
- Outputs: content items in `PLANNED`
- Retry: rerun whole workflow; upsert by idempotency key keeps it safe
- Idempotency: `soc-01:{unit}:{isoWeek}:{slot}`
- Failure: log in n8n, leave no partial rows (create is atomic)

### SOC-02 — Google Drive Media Selector
- Trigger: SOC-01 completed / content in `PLANNED`
- Inputs: content id, service
- Comp AI endpoints: `POST /media/request`, `POST /media/register` (to sync
  Drive folder contents), `POST /media/usage`
- External: Google Drive (read-only list of approved folders)
- Outputs: content in `MEDIA_SELECTED` with a Drive asset attached
- Retry: safe — selection is recomputed, usage write is idempotent
- Idempotency: `soc-02:{contentId}:{assetId}`
- Failure: no eligible asset → leave content `PLANNED`, alert in n8n

### SOC-03 — Caption & Content Generator
- Trigger: content in `MEDIA_SELECTED`
- Inputs: content id
- Comp AI endpoints: `GET /brain-context`, `POST /content/copy`
- External: LLM provider
- Outputs: content in `COPY_GENERATED`
- Retry: same key overwrites the draft copy
- Idempotency: `soc-03:{contentId}:{generationDate}`
- Failure: leave in `MEDIA_SELECTED`; never invent copy client-side

### SOC-04 — Canva Renderer
- Trigger: content in `COPY_GENERATED`
- Inputs: content id, template mapping (n8n-side config)
- Comp AI endpoints: `POST /design`
- External: Canva Connect API, Google Drive (source asset fetch)
- Outputs: content in `DESIGN_GENERATED` with rendered URL + design id
- Retry: poll render job; re-POST same key with new status
- Idempotency: `soc-04:{contentId}:{templateId}`
- Failure: record `FAILED` render with error; content stays `COPY_GENERATED`

### SOC-05 — Approval Router
- Trigger: content in `DESIGN_GENERATED`
- Inputs: content id
- Comp AI endpoints: `POST /approval/send`, `GET /approval/status`,
  `POST /approval/decide` (only when mode allows)
- External: none (approval happens in Comp AI UI)
- Outputs: content `AWAITING_APPROVAL` → `APPROVED`
- Retry: status read is idempotent; send is deduplicated per content
- Idempotency: `soc-05:{contentId}`
- Failure: content parks in `AWAITING_APPROVAL` — visible in the UI

### SOC-06 — Social Publisher
- Trigger: schedule tick over `APPROVED` + due `scheduledAt`
- Inputs: content id
- Comp AI endpoints: `GET /plan`, `POST /publish/result`,
  `POST /publish/post-ids`, `POST /publish/failure`
- External: Meta Graph API (Facebook Page, Instagram Professional)
- Outputs: `SocialPublishAttempt` rows; content `PUBLISHED` or `FAILED`
- Retry: **never auto-retry an ambiguous provider response** — a timeout after
  the POST may have published. Retry only on a definitive provider rejection,
  and always with the same idempotency key
- Idempotency: `soc-06:{contentId}:{platform}` — the unique key is what stops
  double-posting
- Failure: record category + summary; content `FAILED`; human retries from UI

### SOC-07 — Post-Publish Analytics Collector
- Trigger: schedule (daily), posts published in the lookback window
- Inputs: published posts
- Comp AI endpoints: `GET /plan` (status `PUBLISHED`), `POST /analytics`
- External: Meta insights APIs, Google Analytics
- Outputs: `MarketingContentMetric` rows
- Retry: upsert by `(contentId, platform, date)` — always safe
- Idempotency: natural key upsert
- Failure: skip the day; next run upserts it

### SOC-08 — Asset Usage Recorder
- Trigger: after SOC-06 success (or standalone sweep)
- Inputs: post id
- Comp AI endpoints: `POST /media/usage`
- External: none
- Outputs: `DriveAssetUsage` rows, asset cooldowns advance
- Retry: same key safe
- Idempotency: `soc-08:{postId}:{assetId}`
- Failure: non-fatal; next successful publish records usage

### SOC-09 — Performance Learner
- Trigger: schedule (weekly)
- Inputs: metrics window
- Comp AI endpoints: `GET /plan`, metrics read (tRPC only for now),
  `GET /brain-context`
- External: none
- Outputs: themes/notes for SOC-01 (stored in n8n or as draft content ideas)
- Retry: read-only, always safe
- Idempotency: n/a (read-only)
- Failure: skip cycle

## Safety rules (enforced, not aspirational)

- No duplicate publishing — unique idempotency keys on `SocialPost` and
  `SocialPublishAttempt`; ambiguous provider responses are never auto-retried.
- No unapproved media — selection only returns `APPROVED` assets; publishing an
  item whose media is not approved is rejected at the endpoint.
- No secrets in logs — provider tokens never leave `SocialAccount.credentials`;
  error summaries are truncated and carry no response bodies with tokens.
- No email bodies in diagnostics or in `brain-context`.
- No destructive Drive actions — Comp AI stores metadata only; n8n gets
  read-only Drive scope.
- `FULL_AUTO` decisions fail closed while `autopilotEnabled` is false.

## Provider setup still required (outside this repo)

- Meta app with Pages + Instagram Professional publishing scopes; long-lived
  tokens stored on `SocialAccount` via `POST /rest/marketing/social/accounts`.
- Google Drive: approved-media folder per service; n8n holds the credentials.
- Canva: Connect API credentials + brand template IDs; n8n holds them.
- Google Analytics: existing GA4 OAuth grant (already implemented).
