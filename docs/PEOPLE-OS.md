# People OS

Date: 2026-09-06.

Status: architecture only.

Preferred system of record: Frappe HR or ERPNext HR. Frappe HR documents employee lifecycle, attendance, shifts, leave, performance, expense claims, payroll, and mobile access.

Source: [Frappe HR](https://docs.frappe.io/hr/introduction).

## Purpose

People OS tracks people who work for the business. It is separate from CRM contacts.

## Entities

- Employee
- Contractor
- Operator
- Team
- Shift
- Attendance
- Leave request
- Credential
- Payroll reference
- People document

## BusinessUnit Rules

Every worker belongs to one or more BusinessUnits.

Normal staff see only their assigned BusinessUnit.

Owner HQ can aggregate staffing risk across BusinessUnits.

## Operational Links

Workers link to:

- Booking
- Job
- Asset
- Vehicle
- Incident
- Payroll period
- Document

## AI Use Cases

- Find available operators for a date.
- Find workers already assigned to a booking.
- Detect understaffed days.
- Warn about expiring credentials.
- Compare event workload by worker.

## BusinessEvents

- `people.employee.created`
- `people.employee.updated`
- `people.shift.assigned`
- `people.shift.completed`
- `people.leave.requested`
- `people.leave.approved`
- `people.credential.expiring`

## Safety

Payroll, termination, disciplinary, and private HR changes require approval.

Do not put HR intelligence in the API. Use the agent layer for recommendations.
