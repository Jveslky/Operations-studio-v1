# Shop inventory: catalog, receiving and movement integrity

This is the first inventory slice. It adds a usable office workspace at `pages/Shop/inventory.html`, linked from Shop navigation, plus a PostgreSQL catalog and append-only stock history. It creates no stock from historical invoices, AP bills or ROs.

## Rules implemented

- A catalog item has a manufacturer/part-number identity, description, stock unit, bin/location, sale price and reorder point. Identity comparison ignores case and outer spaces. Catalog changes retain before/after values, staff identity and time in `shop_inventory_operations`. Items can be archived/restored; history and stock remain visible through the archived filter. Stock units cannot change after the first movement.
- Confirmed receiving posts physically received quantities in base stock units, and records per-unit cost with up to four decimals. Quantities allow up to three decimals. Users convert packs/boxes before confirmation; unit cost must also be for that base unit. Nothing posts from scanning or uploading alone.
- Every receipt requires supplier, supplier invoice/packing-document reference and delivery reference. That normalized combination is unique within the shop. A partial delivery uses a new delivery reference against the same invoice. Multiple lines commit together or roll back together. Each catalog item appears once per receipt.
- Stock on hand is the sum of immutable movements. Corrections require owner/admin access, a signed delta, the expected current count and a reason. Corrections cannot make stock negative; a stale count is rejected. Correcting an error adds an opposite movement with an explanation rather than deleting a receipt. Corrections do not calculate accounting valuation or modify an AP liability.
- Last receipt cost is displayed as such; it is not weighted-average inventory valuation. Sale prices and reorder points are catalog defaults, not changes to existing RO/invoice prices.
- Each write uses a stable, actor-scoped request ID. Same-key retries return the original outcome; changed payloads or actors are rejected. Same-key locking and item row locks protect stock integrity. The receipt identity index provides an independent duplicate-delivery check.
- Before transmitting, the browser preserves the exact request under a shop/user-specific key. An ambiguous response leaves a visible **Save not yet confirmed** panel and locks new writes until the original request is retried. Requests survive reloads; simultaneous tabs retain separate pending entries. The UI never reports an unconfirmed write as saved. This is inventory request recovery, not the planned full Shop offline-write/synchronization feature.

## Access

Inventory is office-only in this slice. Owner/admin/service writer require server-side `expenses.read` to read the workspace and costs; receiving also requires `expenses.write`. Catalog management and stock correction additionally require owner/admin role and `settings.manage`. Owners retain full access. Explicit finance permission denials and inactive memberships are enforced in PostgreSQL. Existing role presets and AP page access are not changed. Technicians get no catalog/cost/history access in this slice; technician issue/use views belong with RO integration.

All four inventory tables use RLS and expose no authenticated direct writes. Mutations go through scoped RPCs. Receipts, movements and operation history reject updates/deletes. Composite foreign keys prevent linking another shop's part, receipt or operation. Directory and history reads use bounded server-side pagination; search is literal text, including `%` and `_`.

## Test installation and checks

1. Apply `supabase/shop-inventory-foundation-20261016.sql` in **Test** after auth/membership and granular Shop permissions. It can be rerun. Deploy the matching UI. Merging a PR does not apply SQL.
2. As Shop C owner, open Inventory from navigation. Add `QA-FILTER-1`, manufacturer `QA`, unit `each`, bin `A-1`, sale price `$15`, reorder point `2`. Refresh and reopen; verify metadata and zero on hand.
3. Add that part to a receipt, enter supplier `QA Supplier`, invoice `QA-INV-1`, delivery `QA-DEL-1`, quantity `4` and unit cost `$7.125`. Review the effects and confirm once. Refresh: on hand `4`, last receipt cost `$7.125`, history has the actor, time and references.
4. Attempt the same supplier/invoice/delivery again. Expect a duplicate error and unchanged stock. Use delivery `QA-DEL-2` for a partial delivery of `2`; expect on hand `6`. Verify a two-item receipt and exact fractional quantities/costs.
5. Correct by `-2` with a reason: expect `4`. Refresh and correct by `+2` with an explanation: expect `6`, with both entries retained. A correction below zero must fail. In another window change the count, then submit a correction based on the stale count: expect a refresh/review error.
6. Exercise a lost/failed save and reload. The pending panel must preserve the original action, Retry same save must not double-post, and database rejections must retain editable form inputs. Do not clear browser site data to troubleshoot an unconfirmed request.
7. Edit/archive/restore a part; confirm history/counts remain, archived parts cannot be received, and stock-unit changes after movements fail. Check search, low-stock filter, history paging and phone widths (390 px/768 px).
8. Verify writer receiving but no catalog/correction access; deny receiving with the finance-write override; deny all reads with finance-read override. Verify technician, inactive user and another shop cannot retrieve or mutate these records through direct URL, table query or RPC.

Automated checks: `npm test --prefix tests` includes the inventory SQL and UI suites. The SQL suite applies the real migration twice and checks audit/precision, atomic receipts, duplicates/partials, retry identity, stale/nonnegative corrections, immutable history, search/paging and role/tenant boundaries. The UI suite checks escaping, scoped queries, failed/stale reads, lost-response reload/retry identity, user-specific storage and write blocking when recovery storage fails. A real signed-in Test and visual/mobile pass is still required. Headless-browser rendering was unavailable in the implementation environment (browser binary download failed); no visual pass is claimed.

## Connected work still required

This slice intentionally exposes **on hand**, not reserved/available quantities. ROs do not yet reserve or consume stock. Do not infer stock usage from an RO status or payment. The next slice must define shortages, cancellation, reopening, physical issue timing and returns, then connect explicit human-authorized RO saves/closure with exactly-once reservations/consumption. Quick Add Part must support stocked, special-order and customer-supplied parts. Prebuilt jobs must snapshot parts/labor without bypassing approvals.

Scan review must next propose inventory matches and quantities/costs for confirmation, including pack conversion, partial deliveries and core/freight lines. AP remains the source of supplier liability; receiving must not invent a second bill. PO/RO allocation and stable supplier/AP/document references are not implemented by these text receipt references.

The existing Shop backup/restore tool does **not yet include inventory tables**. Extend the scoped backup/recovery format and rehearse restoring ledger/history/operation IDs before pilot or production rollout. Full offline Shop edits/sync/conflict resolution, shared reminders, and the retained tri-state stress-test shops/dashboard remain release work. Apply and verify inventory in Test first; no Live installation or release is implied.

To pause writes without deleting data, revoke authenticated execution on the three mutation RPCs (`save_shop_inventory_item`, `receive_shop_inventory`, `adjust_shop_inventory`). Keep catalog and movement history for review; do not delete inventory tables to disable the feature.
