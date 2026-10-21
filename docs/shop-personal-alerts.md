# Personal Shop alerts — first slice

Test migration: `supabase/shop-personal-alerts-20261021.sql`. Apply after the existing assignment-access and estimate-approval migrations. This branch is independent of prebuilt jobs and scanner PRs. No old workflow records are backfilled.

Assignment to a primary or additional technician creates one durable event in the same transaction as the RO save. A user already in either assignment slot is not alerted again when switching slots. Unassignment followed by reassignment is a new event. Every saved estimate authorization creates a distinct event keyed by its immutable authorization UUID; partial approvals are labeled “authorization recorded,” never represented as approval of the entire job. Approval alerts go to currently assigned users. No email, push or SMS is sent.

Events and per-user deliveries are server-created. Users cannot create events or nominate recipients. Both the authenticated shop context and current RO access are checked on every read. Technicians must still be assigned even in shops where older underlying policies are broader. Inactive membership or removed read permission prevents access. Removing an assignment hides that user's historical alerts for the RO; reassignment can make those historical records visible again.

New personal preferences default on for these two events. Shop owners/admins with settings.manage can disable an event or require it; personal opt-outs cannot suppress required events. Controls affect future delivery only. Events remain as an audit record even when delivery is disabled. This slice does not add arbitrary user-defined rule builders, new financial or stock writes, or additional event types.

## UI

An Alerts button opens a native modal with recent alerts, individual mark-read buttons, My preferences and owner/admin shop rules. The existing inspection/team-request notification feed is retained. The final bottom utility bar remains separate future presentation work. Unread count is server-derived across all accessible alerts; the list shows the most recent 100. A visible tab checks once per minute, and opening or refreshing the modal fetches current state. Read status changes only after server success. Links remain usable if recording a read fails. Native dialog supplies focus containment and Escape close.

## Verification

`node tests/shop-personal-alerts.mjs` uses disposable PostgreSQL (PGlite): migration rerun, primary/additional recipient deduplication, unchanged assignment, cross-shop denial, forged event denial, private delivery helper denial, read idempotence, opt-outs, required/disabled shop rules, reassignment, permission/membership revocation, rollback and source replay.

Manual Test walkthrough (not yet performed):
1. In Shop C as owner, open Alerts and verify both event preferences and shop controls.
2. Assign a new RO to the Shop C tech; in that tech session open Alerts. Verify one assignment alert and correct RO link. Refresh/save without changing assignment: still one.
3. Record a verbal or written estimate authorization as office staff. Tech gets one authorization alert; refresh does not duplicate it. Mark read and reopen: remains read.
4. Turn off the tech's assignment preference. Assign a different RO: no new assignment delivery. Require it as owner; user can no longer opt out, and the next assignment delivers.
5. Unassign tech: old RO alert content disappears. Disable membership and verify feed access fails. Verify another shop cannot retrieve this shop's feed.

Remaining alert types: confirmed web payments, low-stock threshold crossings, new team documents and PTO requests. Integration into the utility bar and event-driven updates remain future slices.

## Shop C manual QA — October 20, 2026

Confirmed assignment alerts for ROs 1014/1015; opening 1015 marked that alert read and retained both records. Estimate authorization on 1015 produced one new alert; explicit mark-read persisted. Personal assignment opt-out suppressed a fresh assignment. Required-by-shop locked the preference and delivered RO1017 despite the opt-out (four total, two unread). Unassigning 1017 hid its alert (three total, one unread). Disabling assignment alerts shop-wide suppressed the fresh RO1018 assignment. Core walkthrough passed; PR114 merged separately from prebuilts.
