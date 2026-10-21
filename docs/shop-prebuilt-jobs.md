# Shop prebuilt jobs — first build

This branch is separate from scanner PR112 and includes no memberships or alerts implementation.

## Setup

Apply `supabase/shop-prebuilt-jobs-20261021.sql` followed by `supabase/shop-prebuilt-allocations-20261021.sql` to Test before exercising the preview. It is rerunnable; do not apply to Live as part of this walkthrough. It adds the shop catalog, versioned save/retry records, and frozen estimate/invoice job snapshots. Existing ROs continue to load without the migration; adding prebuilts is disabled until the column is available.

## Workflow

Open **Prebuilt Jobs** from Shop navigation. Owners/admins with settings permission maintain templates; office users with estimate-write access can select and customize a copy on an RO. Template management does not grant stock access. Stock search and saves retain existing inventory permission checks.

Templates may freely mix across a shop:
- Flat: a base package includes labor and included part quantities. Extra quantities use the explicit extra-unit price. A difference rule charges only a positive difference above the unit allowance.
- Itemized: billable labor hours × the estimate's rate, plus all parts at their unit prices. Base package price and allowances do not apply.
- Mixed: a base package plus selected itemized parts, allowance differences, extra quantities, and optionally hourly labor.

For a 5-quart oil service: set Flat, package price 89.95, allocate labor 35 and parts 54.95, add an oil line with quantity 5, included quantity 5, and extra price 9. Add a filter line with quantity/included quantity 1. Use Included for any-filter-same-price or Difference with an explicit allowance. Select actual inventory items in their stock units. A 13–15-quart same-price package can use included quantity 15 and actual quantity 13, 14 or 15. Set included quantity 13 instead to charge explicitly for additional oil.

Stocked parts use current catalog sale prices at review; non-stock prices use the template's prices. Selecting a substitute updates its identity, stock unit, description and unit price. Review the extra-unit price and allowance separately; they remain explicit shop settings. Changing templates never changes existing estimates. All add operations initially affect only the unsaved estimate. Normal save reserves quantities, revises prior approvals, and checks stock availability. Adding again is an intentional second instance, not a transaction replay.

## Pricing, time and revenue allocation

For every fixed/base package the shop explicitly enters **Prebuilt labor allocation** and **Prebuilt parts allocation**. Their sum must equal the package price ($35 + $54.95 = $89.95). No allocation is inferred. Itemized jobs use separate billable hours times the reviewed rate plus line prices. Mixed jobs add selected charges to the base split. Filter premiums and extra quantities are prebuilt parts revenue.

**Expected job time** is a planning target, independent of **billable labor hours** and actual technician time worked. Changing expected time never changes price. Adding a prebuilt never changes ordinary estimate hours or actual time. Hourly prebuilt labor uses the rate captured at review; later regular-rate edits do not reprice the copy.

The RO stores `estimate_prebuilt_labor_total` as additional fixed labor revenue. `estimate_parts_total` includes regular and prebuilt parts; `estimate_prebuilt_parts_total` identifies its prebuilt subset. Server totals derive from validated version-2 job copies. Tax, authorization and manual/automatic invoice subtotals include prebuilt labor once and combined parts once. Invoice `laborTotal` is regular labor, `prebuiltLaborTotal` is prebuilt labor, `partsTotal` is all parts and `prebuiltPartsTotal` is its prebuilt subset. Regular parts = all parts minus prebuilt parts; overall labor = regular plus prebuilt labor. Allocations are before discount and tax, which remain separate rows.

The RO and invoice show the regular/prebuilt breakdown. Revenue helpers expose the same buckets for future report views; this does not add a reporting dashboard. Packages no longer enter Other charges. Existing unrelated Other charges and tax flags stay unchanged.

Apply `shop-prebuilt-allocations-20261021.sql` **after** the initial prebuilt migration in Test. Both can be rerun. Legacy draft copies retain their original aggregate treatment; historical Other charges are not silently converted. Legacy templates require explicit allocations when reviewed under the new flow. Issued invoices and past approvals are not backfilled.

Stock rows carry a non-duplicating allocation of existing billed value. Reusing an item combines quantities while preserving its previous extended value as closely as cents permit. Costs remain based on stock history, independently of sale price. Editing stock quantity afterward does not automatically reprice the package. Parts total cannot drop below prebuilt parts allocation; review the copied job's price before changing authorization.

Copies retain their reviewed definition, template revision, rate, expected time, billable hours and allocations. Later template edits do not change them. Catalog is bounded to 200 recent entries. Memberships, automatic vehicle matching, per-template permission grants and one-click reversal remain outside this build.

## QA

Automated coverage: actual rerunnable SQL migration, cross-tenant RLS, writer/tech access, exact save retry, mismatched retry, stale version, bad input, foreign stock reference, stale RO edit, approval revision, invoice snapshot, post-invoice edit lock and no template retroactive mutation. Pricing cases cover flat/itemized/mixed, premium filter allowance, cheaper substitute, extra quart, diesel quantities. UI integration tests verify stock merging, correct aggregate charges, unchanged flat labor hours, cancellation and absence of immediate financial/stock writes.

Device/browser walkthrough remains pending. Test owner creation/edit/archive/restore; writer use without catalog editing; 5-quart flat, 6-quart extra, diesel 13–15 included, itemized and mixed packages; substitute a filter; inspect estimate tax/notes; save, refresh and inspect hold counters; reapprove revised estimates; Ready for Payment consumes once and creates one invoice; inspect invoice snapshot and unchanged prior jobs after template revision. Test two simultaneous catalog edits and RO edits. Never apply this migration to Live without the normal release review.
