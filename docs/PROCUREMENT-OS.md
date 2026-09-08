# Procurement OS

Date: 2026-09-06.

Status: architecture only.

Preferred system of record: ERPNext Buying or the selected accounting engine. ERPNext Buying includes supplier quotations, material requests, purchase orders, supplier scorecards, and buying reports.

Source: [ERPNext Buying](https://docs.frappe.io/erpnext/buying).

## Purpose

Procurement OS manages suppliers, requests, orders, bills, deliveries, and recurring costs.

## Entities

- Supplier
- Supplier contact
- Purchase request
- Purchase order
- Delivery
- Supplier bill
- Recurring cost
- Approval policy
- Supplier document

## Flow

Need -> Purchase Request -> Approval -> Purchase Order -> Delivery -> Supplier Bill -> Payment -> Finance.

## BusinessUnit Rules

Each request and supplier relationship has BusinessUnit scope.

Shared suppliers can link to multiple BusinessUnits.

Owner HQ aggregates spend and supplier risk.

## Approval

Spend thresholds are configuration.

Do not hard-code currency amounts.

Consequential spend uses ApprovalRequest.

## AI Use Cases

- Detect duplicate subscriptions.
- Find cost increases.
- Suggest supplier consolidation.
- Identify late deliveries.
- Compare supplier pricing.
- Forecast recurring expenses.

## BusinessEvents

- `procurement.request.created`
- `procurement.request.approved`
- `procurement.po.created`
- `procurement.delivery.received`
- `procurement.bill.received`
- `supplier.created`
- `supplier.updated`

## Safety

Banking changes and high-value orders require approval and audit.
