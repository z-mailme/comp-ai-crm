# Asset OS

Date: 2026-09-06.

Status: architecture only.

Preferred system of record: ERPNext Assets until Comp AI needs a lighter dedicated asset module. ERPNext supports asset value, location, ownership, depreciation, insurance, and lifecycle data.

Source: [ERPNext Asset](https://docs.frappe.io/erpnext/asset).

## Purpose

Asset OS tracks physical and infrastructure assets.

Examples:

- 360 booth units
- cameras
- printers
- lights
- laptops
- tablets
- batteries
- props
- backdrops
- vehicles
- cleaning equipment
- servers

## Entities

- Asset
- Asset category
- Location
- Assignment
- Maintenance record
- Availability block
- Warranty
- Insurance record
- Asset document

## Statuses

- AVAILABLE
- RESERVED
- IN_USE
- MAINTENANCE
- DAMAGED
- LOST
- RETIRED

## Booking Link

Bookings later reserve specific asset units.

Example:

Booking -> 360 booth unit -> camera -> printer -> operator -> vehicle.

This prevents double-booking scarce resources.

## Calendar Link

Resource reservations feed Calendar capacity.

Calendar must show resource conflicts without pretending assets are people.

## BusinessEvents

- `asset.created`
- `asset.reserved`
- `asset.assigned`
- `asset.returned`
- `asset.damaged`
- `asset.maintenance_due`
- `asset.maintenance_completed`

## Safety

Retiring, deleting, or marking an expensive asset lost requires approval.
