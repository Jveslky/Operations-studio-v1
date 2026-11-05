# Offline repair-order database support

The migration in supabase/migrations adds sync_shop_offline_ro and its private operation ledger, ported from the tested Rage Room database.

Supported writer fields are complaint, parts needed, customer notes, technician notes, additional work, labor hours and priority. Technicians are limited to the work-note fields and require current work access. Status, financials, assignments, approvals and stock changes require online saves.

Each request carries the shop, actor, RO, expected server timestamp and patch. The function locks the request key and RO, checks current permissions, returns an earlier result only for an identical request, reports stale versions as conflicts, and commits the edit and replay record together. The ledger has RLS enabled and no direct anonymous/authenticated access. Only authenticated callers can invoke the API.

Dependencies are existing shops/repair-order tables, auth.uid, shop_can_access_ro and shop_has_permission. The migration fails clearly if the permission helpers are missing.

The database is installed on Test. This branch now includes the browser device queue and its recovery shell. The candidate still needs a signed-in Test browser check before release.

Local verification is node tests/shop-offline-ro-sql.mjs. It covers repeated installation, replay, stale edits, invalid fields, actor/tenant checks, technician work permissions and revocation, anonymous denial, ledger privacy and rollback when recording the operation fails. This uses a disposable PostgreSQL-compatible local database with permission fixtures. Deployed Test checks must also use its actual permission functions.

To back out the feature, first stop queue submissions and retain all device drafts and operation records for reconciliation. Revoke API execution as a controlled temporary disablement if needed. Retain the table and saved records so lost-response retries can still be reconciled. Do not drop the ledger during rollback.

## Test installation verification

On November 4, 2026, Test was resumed from its paused state. The offline RO migration and invoice-only payment index were installed there. A rollback-only smoke check with Test's existing owner, service writer, assigned technician and other-shop actor passed. It verified writer save, exact replay, altered request rejection, stale conflict, online-only status rejection, assigned technician work notes, technician office-field rejection, cross-shop denial and exactly two operation records. Its synthetic rows were rolled back.

The four focused local programs passed: offline RO SQL, existing offline note SQL, offline note role checks and RO save conflict checks.

The payment index is nonunique on invoice_id and was verified valid and ready. Test had 36 payment rows when installed. On a large production table, plan index installation separately and account for the locking needed by a regular index build. This migration bounds lock wait at five seconds.

Security-advisor changes were the expected new private RLS table without direct policies and the intentionally authenticated-only SECURITY DEFINER RPC. Existing anonymous-executable warnings did not increase. The new function fixes its search path and checks current actor access and the allowed fields before editing.

Existing note sync, AP bill recovery, payment recording, inventory receiving and RO numbering definitions matched Rage Room. The invoice-number difference was diagnostic instrumentation. That diagnostic definition was not included in these migrations.

Live has not been inspected or migrated as part of this Test installation.

## Browser integration candidate

The current Test controller now uses the broader RO queue. Supported edits are saved locally as the user types while offline, and the normal Save button also saves them locally. The save panel stays hidden during ordinary connected work. It uses “Saved on this computer,” “Saved to the shop,” and “Review changes.” Saved-change details stay collapsed until attention is needed.

Reconnect and transient-failure retries verify the current account, hold a browser lock, freeze the submitted payload, and reuse the same request until confirmed. A second lifetime lock prevents duplicated tabs, including tabs with copied sessionStorage IDs, from replacing the same unsent draft. After confirmation the controller reloads only if online-only fields and approval controls have no unsaved changes. Those other changes otherwise remain on the form with an explicit reload control. Role-disabled inputs remain disabled.

Old technician-note drafts retain their existing sync/review path. New note-only drafts are no longer offered beside the broader controls. Same-tab reopening supports both the older v1 note snapshot and v2 RO snapshot, checks the cached account/session expiry, and saves the last typed edit before returning online. Drafts retain their original expected server version. The worker caches only three public static files; it never caches authenticated API responses. Worker installation remains limited to the combined Test hostname.

Automated verification: the default suite includes the new SQL, device-queue and reopening programs plus the existing note queue/reopening and static-worker checks. The queue tests cover lost responses with identical retries, explicit conflict review, safe refresh, storage failure after an earlier save, duplicate tabs, legacy blocking, actor/project/shop isolation, denied access and field restrictions. Reopening checks cover hydration, expiry/account changes, frozen requests and storage failures during reconnect.

The full default suite passed (44 programs). These tests use local SQL and browser mocks; they do not replace a signed-in browser check. A local Playwright browser could not be installed because its browser download returned a truncated archive. No visual browser result is claimed.

Before promoting the UI: open a synthetic RO on Test as writer and assigned technician; save offline, reconnect, verify the persisted fields, simulate a changed server version and review it, reload offline in the same tab, and confirm status/billing edits remain online-only. Verify an existing legacy note draft is recoverable. Live remains unchanged.

## Test browser observations and notice follow-up

Jon exercised RO1031 in Chrome on November 4, 2026 (local time). Screenshots showed the local-save confirmation while offline, shop-save confirmation after reconnect, the first test note after reload, both test lines in the static recovery page after an offline reload, and both lines on the regular RO after reconnect. These observations cover the owner note path; technician, stale-edit review and the other supported fields still need browser acceptance.

The note-only runs held automatic reload. The controller included transient approval controls in its value baseline before async tax/history setup finished. The approval renderer populates a read-only calculated authorization amount later, so an untouched control could look edited. Persisted online-only fields still use value comparisons. Transient approval controls now block reload on input/change events, which preserves actual approval work while excluding automatic setup. Regression checks cover both cases and retain the status/financial-change guard.

The save notice now uses an amber background and bold “Offline mode” heading while disconnected. A pending reconnect save remains amber with “Waiting to save to the shop.” Normal connected work remains quiet. Shared queue, page and static-worker versions are advanced together. This follow-up is verified locally; repeat the note-only browser path after deployment to verify automatic reload and the stronger visual state.
