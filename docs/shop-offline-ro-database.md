# Offline repair-order database support

The migration in supabase/migrations adds sync_shop_offline_ro and its private operation ledger, ported from the tested Rage Room database.

Supported writer fields are complaint, parts needed, customer notes, technician notes, additional work, labor hours and priority. Technicians are limited to the work-note fields and require current work access. Status, financials, assignments, approvals and stock changes require online saves.

Each request carries the shop, actor, RO, expected server timestamp and patch. The function locks the request key and RO, checks current permissions, returns an earlier result only for an identical request, reports stale versions as conflicts, and commits the edit and replay record together. The ledger has RLS enabled and no direct anonymous/authenticated access. Only authenticated callers can invoke the API.

Dependencies are existing shops/repair-order tables, auth.uid, shop_can_access_ro and shop_has_permission. The migration fails clearly if the permission helpers are missing.

Apply to Test first. This migration alone does not install the browser device queue. Integrate the queue and verify its UI against the same database before release.

Local verification is node tests/shop-offline-ro-sql.mjs. It covers repeated installation, replay, stale edits, invalid fields, actor/tenant checks, technician work permissions and revocation, anonymous denial, ledger privacy and rollback when recording the operation fails. This uses a disposable PostgreSQL-compatible local database with permission fixtures. Deployed Test checks must also use its actual permission functions.

To back out the feature, first stop queue submissions and retain all device drafts and operation records for reconciliation. Revoke API execution as a controlled temporary disablement if needed. Retain the table and saved records so lost-response retries can still be reconciled. Do not drop the ledger during rollback.

## Test installation verification

On November 4, 2026, Test was resumed from its paused state. The offline RO migration and invoice-only payment index were installed there. A rollback-only smoke check with Test's existing owner, service writer, assigned technician and other-shop actor passed. It verified writer save, exact replay, altered request rejection, stale conflict, online-only status rejection, assigned technician work notes, technician office-field rejection, cross-shop denial and exactly two operation records. Its synthetic rows were rolled back.

The four focused local programs passed: offline RO SQL, existing offline note SQL, offline note role checks and RO save conflict checks.

The payment index is nonunique on invoice_id and was verified valid and ready. Test had 36 payment rows when installed. On a large production table, plan index installation separately and account for the locking needed by a regular index build. This migration bounds lock wait at five seconds.

Security-advisor changes were the expected new private RLS table without direct policies and the intentionally authenticated-only SECURITY DEFINER RPC. Existing anonymous-executable warnings did not increase. The new function fixes its search path and checks current actor access and the allowed fields before editing.

Existing note sync, AP bill recovery, payment recording, inventory receiving and RO numbering definitions matched Rage Room. The invoice-number difference was diagnostic instrumentation. That diagnostic definition was not included in these migrations.

Live has not been inspected or migrated as part of this Test installation.
