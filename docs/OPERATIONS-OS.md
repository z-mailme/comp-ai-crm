# Operations OS

Date: 2026-09-06.

Status: architecture only.

## Purpose

Operations OS turns a confirmed booking into fulfilled work.

## Lifecycle

Lead -> Deal -> Quote -> Deposit -> Booking -> Job -> Resource allocation -> Staff allocation -> Travel -> Setup -> Service delivery -> Pack-down -> Completion -> Final payment -> Review.

## Entities

- Job
- Job assignment
- Resource allocation
- Staff assignment
- Checklist
- Checklist item
- Travel plan
- Incident
- Job note
- Job cost
- Job profitability snapshot

## Booking Is Not Enough

Booking stores the commercial commitment.

Job stores operational fulfilment.

One booking can create one or more jobs.

## Checklists

Checklists are service-specific.

Example for a 360 booth:

- Confirm venue.
- Confirm event time.
- Confirm template.
- Test booth.
- Charge devices.
- Pack equipment.
- Load vehicle.
- Check in on arrival.
- Complete setup.
- Report damage.
- Mark job complete.

## Profitability

Job margin combines:

- invoice revenue
- staff cost
- travel cost
- equipment cost allocation
- supplier cost
- marketing acquisition cost
- other direct costs

## BusinessEvents

- `operations.job.created`
- `operations.job.assigned`
- `operations.job.started`
- `operations.job.completed`
- `operations.checklist.completed`
- `operations.incident.created`
- `operations.resource.conflict`
- `operations.staff.conflict`

## Safety

Cancellations, refunds, and incident closure with customer impact require approval.
