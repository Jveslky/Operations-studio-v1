# Snow data foundation (design draft)

Snow Service Desk is currently a browser-local concept. This document is a proposed backend contract, **not an applied migration**. Do not enter real customer or property details until authentication, tenant isolation, storage policies, and a restore path have been tested.

## Boundary and roles

Give Snow its own `snow_workspaces` and `snow_members` records. A membership in Shop, Mobile, or PFleet must not grant Snow access. Link a Snow workspace to another module only through an explicit owner-approved mapping later; do not copy that module's membership or records as part of Snow signup.

| Role | View | Schedule / quote | Perform service | Manage users / exports |
| --- | --- | --- | --- | --- |
| Owner | All workspace records | Yes | Yes | Yes |
| Dispatcher | All workspace records | Yes | Yes | No |
| Operator | Assigned routes / tickets | Status, notes, materials only | Yes | No |

Inactive memberships grant no access. Every policy checks `auth.uid()` and an active membership in the same `workspace_id`. An owner creates the workspace through one controlled transaction that also creates the initial owner membership. No client may grant itself a role, reactivate itself, change `workspace_id`, or forge another actor ID.

## Proposed records

| Table | Core fields | Key constraint |
| --- | --- | --- |
| `snow_workspaces` | `id`, name, created_at | Separate tenant identity; optional explicit link to a shop later |
| `snow_members` | `workspace_id`, `user_id`, role, active, created_at | Unique workspace/user; role changes restricted to owner |
| `snow_customers` | `id`, `workspace_id`, name, phone, email | No global customer lookup across tenants |
| `snow_properties` | `id`, `workspace_id`, customer_id, address, type, access_notes, preferences | Composite FK `(workspace_id, customer_id)`; never reference another tenant's customer |
| `snow_routes` | `id`, `workspace_id`, name, area | Routes belong to one workspace |
| `snow_service_events` | `id`, `workspace_id`, property_id, route_id, assigned_user_id, priority, service, status, scheduled_at, started_at, completed_at, conditions, material type/quantity/unit, notes, ready_to_bill_at | Composite FKs for property and route; timestamps set server-side for changes |
| `snow_quotes` | `id`, `workspace_id`, service_event_id, version, status, pricing_method, unit_rate, projected_total, agreed_terms, estimate_input_snapshot, agreed_at, agreed_by | Unique `(service_event_id, version)`; a revision creates a new version instead of silently overwriting agreed terms |
| `snow_event_log` | `id`, `workspace_id`, service_event_id, actor_id, occurred_at, action, previous/new values | Append only via server function; no client update/delete |
| `snow_service_photos` (later) | `id`, `workspace_id`, service_event_id, storage_path, stage, customer_share_selected, uploaded_by, uploaded_at | Private bucket path scoped to workspace/event; signed access for authorized users |

Use composite unique keys `(workspace_id, id)` on parent tables and matching composite foreign keys in children. This prevents a record from referencing another tenant's object even when a guessed UUID is supplied. Index service events by `(workspace_id, status, scheduled_at)`, `(workspace_id, route_id, scheduled_at)`, and `(workspace_id, property_id, started_at)`.

## RLS and write path

- Enable RLS on every Snow table before exposing it. Grant the authenticated role only the columns and operations needed; never rely on client UI hiding buttons.
- Owner and dispatcher can create customers, properties, routes, quotes, and stops. An operator can see assigned tickets and append permitted service updates, photos, material usage, and condition notes. Assignment and pricing changes stay with owner/dispatcher.
- Keep event log insertion in a transaction/function that verifies the active member and computes actor/time on the server. Direct client writes and all update/delete to log are denied. Quote acceptance and service completion should write both the state transition and log entry in the same transaction.
- Only owner and dispatcher can mark ready to bill. Billing integration should consume the agreed quote version and actual service event ID; the Snow module must not infer an invoice merely from a completed status.
- Customer notifications should use an authenticated server worker, per-event opt-in, idempotency key, delivery state, and an explicit no-ETA default. Photos remain private until selected for customer delivery.

## Migration and QA gate

1. Create migration and server functions in a feature PR; review tenant FKs, roles, grants, and storage policies before running SQL. Existing `snowDeskDraft.v1` data is **not** automatically imported.
2. Test two independent Snow workspaces with owner, dispatcher, operator, and inactive member. Verify cross-workspace selects, writes, guessed IDs, role escalation, photo paths, exports, and restored records all fail or stay scoped as intended.
3. Offer a deliberate import of local concept data only into the authenticated current workspace after preview, duplicate review, and user confirmation. Never infer Shop or PFleet ownership from a browser's cached records.
4. Only then connect the live Snow UI and trial customer data. Keep the browser-local concept clearly labeled until this gate passes.
