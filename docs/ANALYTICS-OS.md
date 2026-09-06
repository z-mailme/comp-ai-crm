# Analytics OS

Date: 2026-09-06.

Status: architecture only.

## Purpose

Analytics OS gives one metric layer for sales, marketing, finance, operations, people, assets, automation, and AI agents.

Do not create isolated dashboards with duplicated definitions.

## Metric Layer

Each metric needs:

- id
- title
- owner
- grain
- source records
- calculation
- filters
- BusinessUnit rule
- freshness
- caveats

## Owner Metrics

- revenue
- gross profit
- net profit
- cash flow
- bookings
- enquiries
- conversion rate
- average booking value
- outstanding invoices
- advertising spend
- CPL
- CAC
- ROAS
- repeat customers
- customer lifetime value
- staff utilization
- equipment utilization
- job profitability

## Dimensions

- BusinessUnit
- date
- service
- customer
- location
- salesperson
- operator
- marketing channel
- campaign
- equipment
- booking type

## Forecasts

Future forecasts:

- revenue
- cash flow
- pipeline
- bookings
- staffing demand
- equipment demand
- marketing performance

## AI Analyst

The agent can answer business questions only from source-backed records.

Every answer needs evidence links to records or aggregated source data.

## BusinessEvents

Analytics usually reads BusinessEvents.

It writes events only for material alerts:

- `analytics.metric.threshold_crossed`
- `analytics.forecast.changed`
- `analytics.report.generated`

## Safety

Do not let analytics recommendations execute spend, staffing, finance, or customer actions without approvals.
