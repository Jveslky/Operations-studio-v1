# Offline repair-order database support

The migration in supabase/migrations adds sync_shop_offline_ro and its private operation ledger, ported from the tested Rage Room database.

Supported writer fields are complaint, parts needed, customer notes, technician notes, additional work, labor hours and priority. Technicians are limited to the work-note fields and require current work access. Status, financials, assignments, approvals and stock changes require online saves.

Each request carries the shop, actor, RO, expected server timestamp and patch. The function locks the request key and RO, checks current permissions, returns an earlier result only for an identical request, reports stale versions as conflicts, and commits the edit and replay record together. The ledger has RLS enabled and no direct anonymous/authenticated access. Only authenticated callers can invoke the API.

Dependencies are existing shops/repair-order tables, auth.uid, shop_can_access_ro and shop_has_permission. The migration fails clearly if the permission helpers are missing.

Apply to Test first. This migration alone does not install the browser device queue. Integrate the queue and verify its UI against the same database before release.

Local verification is node tests/shop-offline-ro-sql.mjs. It covers repeated installation, replay, stale edits, invalid fields, actor/tenant checks, technician work permissions and revocation, anonymous denial, ledger privacy and rollback when recording the operation fails. This uses a disposable PostgreSQL-compatible local database with permission fixtures. Deployed Test checks must also use its actual permission functions.

To back out the feature, first stop queue submissions and retain all device drafts and operation records for reconciliation. Revoke API execution as a controlled temporary disablement if needed. Retain the table and saved records so lost-response retries can still be reconciled. Do not drop the ledger during rollback.
