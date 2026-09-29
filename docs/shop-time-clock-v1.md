# Shop time clock V1 proposal

Keep attendance time separate from repair order labor and billable guide hours.

## Technician flow

- One Clock In / Clock Out control on My Workday, showing the active shift and elapsed time.
- Optional Start Break / End Break; do not infer breaks from inactivity or browser closure.
- A refresh, logout, or second device reads the same server-side active shift. A running clock never depends on browser timers for its stored duration.
- Forgotten punch: technician submits a correction request with a reason; owner or permitted office user approves it. Preserve both original and corrected times.

## Data and access

- Store punch events with shop ID, user ID, server timestamp, action, and actor. Derive shifts and break totals from events; never overwrite an event.
- Prevent overlapping active shifts and duplicate consecutive punches in a database function, not just the UI.
- Technicians see only their own punches. Office sees shop timesheets, with export and an approval trail.
- Use shop timezone only for display and pay-period grouping. Store timestamps in UTC.

## Deliberate boundary

This first clock measures time on the job for a workday. A future RO timer can attribute portions of a shift to repair orders, but should never silently change sold labor hours or payroll totals.
