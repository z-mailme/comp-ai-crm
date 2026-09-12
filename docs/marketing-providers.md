# Marketing provider requirements

Date: 2026-09-11. Milestone: feat/marketing-os-foundation.

Status of verification, per source:

- Google Ads API: verified against the official release notes on 2026-09-11.
- Meta: developers.facebook.com refused automated reads (HTTP 400) on
  2026-09-11. The requirements below are recorded from prior integration work
  and MUST be re-verified against the live Meta documentation at connect time.
  The Graph API version is a configurable field for this reason.
- Listmonk: self-hosted; API shape verified against the running client code and
  the official docs at https://listmonk.app/docs/apis/campaigns/.

## Google Ads

Verified from [Google Ads API release notes](https://developers.google.com/google-ads/api/docs/release-notes):

- Current major version: **v25** (v25.1 released 2026-08-19). The client calls
  `https://googleads.googleapis.com/v25/customers/{id}/googleAds:searchStream`.
- Required HTTP headers: `authorization: Bearer <oauth access token>`,
  `developer-token`, and `login-customer-id` when operating through a
  manager (MCC) account.
- OAuth scope: `https://www.googleapis.com/auth/adwords` (single scope, covers
  read and write; this milestone is read-only).
- Setup required outside the code: a Google Cloud project with the Google Ads
  API enabled, OAuth consent screen, a developer token from the API Center of a
  Google Ads manager account, and the customer id (10 digits, no hyphens stored
  with hyphens stripped by the operator).
- Reporting is GAQL over `searchStream`; there is no paging token on
  `searchStream` (it streams the full result), so the client caps with
  `LIMIT 50` and a date-window `WHERE segments.date DURING LAST_30_DAYS`.
- Reports used: `FROM campaign` (budgets + metrics), `FROM ad_group`
  (nested under campaigns), and `FROM search_term_view` (the search terms
  report with campaign and ad group context).
- Quotas: developer tokens have daily operation limits by access level
  (test / basic / standard). Cached snapshots are stored so a page render never
  calls the API.

## Snapshot caching (Google Ads and Meta Ads)

Page renders never call provider APIs. Reads come from the
`MarketingAdsSnapshot` table (one row per BusinessUnit, provider and report
kind). Two triggers refresh the snapshots:

- The `marketing.syncAds` mutation (`POST /rest/marketing/ads/sync`) behind
  the Sync now button.
- The cron route `GET|POST /internal/sync/marketing-ads`, gated by
  `CRON_SECRET`, scheduled in `apps/api/vercel.json` every 6 hours. It syncs
  every BusinessUnit with a connected Google Ads or Meta Ads integration.

A failed sync records the error on the snapshot row, keeps the last good
payload, and moves the integration to NEEDS_ATTENTION. Listmonk is
intentionally NOT snapshot-cached: it is self-hosted on the same VPS, has no
quota, and the dashboard read is a same-network call.

## Meta (unverified this session — re-verify before enabling)

Recorded requirements, to confirm against the live docs:

- Marketing API on the Graph API, versioned (`vXX.0`). The integration stores
  `graphVersion` per connection; the code never hardcodes one.
- Expected permissions for read-only reporting: `ads_read`, plus
  `ads_management` only if writes are ever enabled (not in this milestone).
- Reporting reads three account edges with nested
  `insights.date_preset(last_30d)`: `/campaigns`, `/adsets` (grouped by
  `campaign_id`) and `/ads` (grouped by `adset_id`). Insights include
  `spend, impressions, clicks, ctr, cpc, cpm, reach, actions, action_values,
  cost_per_action_type`.
- Meta paginates with `paging.next`; the client follows it up to 4 pages per
  edge and per sync, capped by `MARKETING_ADS.metaMaxPages`.
- Expected permissions for organic publishing: `pages_manage_posts`,
  `pages_read_engagement` for Facebook Pages; `instagram_basic`,
  `instagram_content_publish` for Instagram professional accounts via the
  Instagram Platform / Graph API content publishing endpoints.
- Instagram publishing requires a professional (business/creator) account
  linked to a Facebook Page, and media containers created then published in two
  calls.
- App review: advanced access to these permissions requires Meta app review
  for any app used outside its own developer accounts.
- Webhooks exist for comments/mentions; whether they are available depends on
  granted permissions — the social inbox stays a foundation until verified.

## Listmonk

Verified against the official docs at https://listmonk.app/docs/apis/ on
2026-09-11 (campaigns, subscribers, lists):

- Self-hosted; REST API under `/api`.
- Auth: HTTP basic (username/password) or token; both are supported by the
  client and stored server-side only.
- Used endpoints: `GET /api/campaigns?no_body=true`, `GET /api/lists`,
  `GET /api/templates`, `GET /api/subscribers` (totals and per-list pages),
  `POST /api/campaigns` (JSON: `name`, `subject`, `lists`, `from_email`,
  `send_at`, `tags`, `body`, `content_type`),
  `PUT /api/campaigns/{id}` (sets `send_at`),
  `PUT /api/campaigns/{id}/status` (`scheduled` from `draft` only),
  `POST /api/campaigns/{id}/test`, `POST /api/lists` (`type`, `optin`),
  `POST /api/subscribers` (`preconfirm_subscriptions` used because consent is
  recorded in the CRM).
- Scheduling a campaign means setting `send_at` and then moving the campaign
  from `draft` to `scheduled`; both calls run only after a Comp AI approval
  request is approved.
- Listmonk owns bulk sending, bounce handling and the unsubscribe page. Comp AI
  never re-adds an address Listmonk has unsubscribed.
- Block-based templates live in Comp AI (`MarketingEmailTemplate`) and render
  to HTML server-side; the unsubscribe block renders `{{ UnsubscribeURL }}`.

## Canva

- Canva Connect APIs (https://www.canva.dev/docs/connect/) cover assets,
  designs, exports and brand templates. Several endpoints are marked preview
  and are not production-safe. No Canva calls are made in this milestone; the
  media library stores approved assets and records the Canva design id when one
  exists.

## n8n boundary

Comp AI exposes every tRPC procedure as REST under `/rest` with an OpenAPI
document at `/openapi.json`, authenticated with workspace API keys
(Settings → API Keys). n8n orchestrates against those endpoints and never
touches the database. Production autopilot stays disabled in this milestone:
the default publishing policy is APPROVAL REQUIRED.
