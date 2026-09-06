# Owner HQ

Date: 2026-09-06.

Status: architecture only.

## Purpose

Owner HQ gives authorized owners a cross-business command centre without breaking BusinessUnit isolation.

## Current State

`BusinessUnit` exists.

`business-context.ts` sets `crossBusinessRead` to `false`.

The current Business OS APIs require one selected BusinessUnit when more than one unit is authorized.

## Future Route

Use `/owner` or `/{slug}/owner`.

Do not build it until aggregate authorization rules exist.

## Portfolio Summary

Show:

- total cash
- total monthly revenue
- total profit
- total receivables
- total payables
- total marketing spend
- overdue payments
- system warnings

## Per BusinessUnit Summary

For each BusinessUnit show:

- revenue
- profit
- cash
- bookings
- pipeline
- outstanding invoices
- overdue payments
- marketing spend
- ROAS
- tasks
- incidents
- system warnings

## Owner Alerts

Examples:

- overdue invoices
- rising CPL
- maintenance due
- understaffed jobs
- unanswered leads
- failed backups
- overdue subscriptions

## Authorization

Normal BusinessUnit users see only their unit.

Owner and admin users need explicit aggregate permissions.

Aggregate queries must not reuse unit-scoped APIs in a way that leaks raw records.

## AI Questions

The owner can ask:

- Which business needs attention today?
- Which business generated the most profit?
- Which business is growing fastest?
- How much cash exists across all businesses?
- Where should the next investment go?

Answers must cite source records or metric definitions.

## BusinessEvents

Owner HQ usually reads BusinessEvents.

It writes events only for portfolio-level alerts:

- `owner.alert.created`
- `owner.brief.generated`
- `owner.priority.created`
