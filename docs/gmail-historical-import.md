# Gmail Historical Import

## Architecture

Historical Gmail import uses persistent `MailboxHistoricalImportJob` and `MailboxHistoricalImportChunk` rows.

The job stores the requested Gmail range, aggregate progress, status, retry time, lease, errors, and verification result.

Each chunk stores one non-overlapping Gmail range, counters, retry state, ignored Gmail ids, and verification state.

The importer calls the existing strict Gmail backfill service.

`ThreadWriterService.store` remains the only writer for email threads, messages, activities, contacts, companies, deals, and bookings.

## Lifecycle

New jobs start in `PLANNING`.

Planning starts with calendar-month chunks.

The worker dry-runs one candidate chunk per tick.

A safe chunk has `truncated = false`.

A truncated month splits into 7-day chunks.

A truncated 7-day chunk splits into daily chunks.

Smaller ranges bisect until they fit or reach the configured minimum split.

Only final leaf chunks count toward `totalMessages`.

The worker imports one planned chunk per tick.

Imported chunks enter `COMPLETED`, then verification starts.

Verification dry-runs the exact same chunk range.

The job enters `COMPLETED` only when every chunk has no missing messages.

## Worker Endpoint

Use this endpoint for the Coolify Scheduled Task later:

```sh
curl -fsS -X POST "$APP_URL/internal/sync/gmail/historical-import/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The endpoint processes one due step.

A step plans one chunk, imports one chunk, or verifies one chunk.

A 1-minute cadence is a safe default.

The route uses `CRON_SECRET`.

Do not expose this route in the browser.

## Retry Behavior

Gmail rate limits set the job and chunk to `WAITING_RATE_LIMIT`.

The worker stores `retryAfterAt` with a safety buffer.

The worker skips the job until `retryAfterAt`.

Retryable failures use bounded exponential backoff.

The backoff is 30 seconds, 60 seconds, 2 minutes, 5 minutes, 10 minutes, and 15 minutes.

The worker stops after the configured max retry count.

The failed job keeps all imported email.

Resume clears failed chunk state and continues from persisted rows.

## Pause, Resume, Cancel

Pause sets the job to `PAUSED`.

Pause stops new chunks from starting.

Resume returns the job to planning or ready state.

Cancel sets the job to `CANCELLED`.

Cancel preserves imported email.

## Completeness Guarantees

The live Gmail history cursor is not read or updated by historical import.

The strict backfill path skips Gmail ids that already exist with complete mirror metadata.

The mailbox writer enforces RFC message id uniqueness.

Final verification accepts already stored messages and persisted ignored Gmail ids.

Verification requeues a chunk when Gmail still reports missing fetchable messages.

The job completes only after all chunks verify.

## PostgreSQL NUL Byte Failure

PostgreSQL text fields reject `\u0000`.

The failure happens when Gmail payload text reaches `ThreadWriterService.store` and is written to text or JSON fields.

The protected persistence path is:

Gmail API -> parser -> strict backfill or live sync -> `ThreadWriterService.store` -> email projections -> BusinessEvent outbox.

The sanitation boundary removes only NUL bytes from persisted mailbox text and JSON string values.

It preserves Unicode, emoji, accents, tabs, and newlines.

It does not mutate provider identity fields.

## Resume After Deploy

Use the existing failed job.

Do not create a new job.

Do not purge Gmail data.

Do not reset the imported counters.

Resume clears failed chunk state and requeues the same chunk.

Strict backfill skips Gmail ids that already exist with complete mirror metadata.

The same chunk continues without duplicate email messages, threads, activities, conversations, or BusinessEvents.

## Mirror Metadata Refresh

A stored Gmail row with `gmailThreadId` null predates the Gmail mirror columns.

One migration added `gmailThreadId` and `labelIds` together, so the null thread id marks exactly those rows.

Strict backfill fetches Gmail metadata for them instead of skipping them.

The refresh updates only `gmailThreadId` and `labelIds` on the existing row.

It never inserts a duplicate `EmailMessage`.

It never touches CRM links, activities, or message content.

Unread, starred, and important state derive from `labelIds` at read time.

The backfill outcome counts written, refreshed, and already stored messages separately.

Chunks track `messagesRefreshed` and jobs track `refreshedMessages`.

## Post-Deploy Checks

1. Confirm the historical import job id is unchanged.
2. Confirm the failed chunk is requeued.
3. Confirm `alreadyStoredMessages` is preserved.
4. Confirm `writtenMessages` increases only for missing Gmail ids.
5. Confirm logs show Gmail message id, Gmail thread id, job id, chunk id, and failure category on persistence errors.
6. Confirm logs do not show private email bodies.
7. Confirm final verification completes after all chunks process.
