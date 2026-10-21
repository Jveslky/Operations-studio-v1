# Shop prebuilt jobs — first build

This branch is separate from scanner PR112 and includes no memberships or alerts implementation.

## Setup

Apply `supabase/shop-prebuilt-jobs-20261021.sql` to Test before exercising the preview. It is rerunnable; do not apply to Live as part of this walkthrough. It adds the shop catalog, versioned save/retry records, and frozen estimate/invoice job snapshots. Existing ROs continue to load without the migration; adding prebuilts is disabled until the column is available.

## Workflow

Open **Prebuilt Jobs** from Shop navigation. Owners/admins with settings permission maintain templates; office users with estimate-write access can select and customize a copy on an RO. Template management does not grant stock access. Stock search and saves retain existing inventory permission checks.

Templates may freely mix across a shop:
- Flat: a base package includes labor and included part quantities. Extra quantities use the explicit extra-unit price. A difference rule charges only a positive difference above the unit allowance.
- Itemized: labor guide hours × the estimate's rate, plus all parts at their unit prices. Base package price and allowances do not apply.
- Mixed: a base package plus selected itemized parts, allowance differences, extra quantities, and optionally hourly labor.

For a 5-quart oil service: set Flat, package price 89.95, add an oil line with quantity 5, included quantity 5, and extra price 9. Add a filter line with quantity/included quantity 1. Use Included for any-filter-same-price or Difference with an explicit allowance. Select actual inventory items in their stock units. A 13–15-quart same-price package can use included quantity 15 and actual quantity 13, 14 or 15. Set included quantity 13 instead to charge explicitly for additional oil.

Stocked parts use current catalog sale prices at review; non-stock prices use the template's prices. Selecting a substitute updates its identity, stock unit, description and unit price. Review the extra-unit price and allowance separately; they remain explicit shop settings. Changing templates never changes existing estimates. All add operations initially affect only the unsaved estimate. Normal save reserves quantities, revises prior approvals, and checks stock availability. Adding again is an intentional second instance, not a transaction replay.

## Financial mapping and first-build limits

The existing estimate has aggregate billing fields. This build puts the flat/base package charge in taxable Other charges under "Prebuilt package charges", itemized hours in labor, and parts/extras in Parts total. A pre-existing non-taxable Other charge blocks a flat package addition to avoid changing its tax classification. Flat labor guide hours are retained in the copied job definition but do not create invented billed hours. Consequently flat package revenue is currently reported as Other, not split into labor and parts revenue. Review that accounting allocation before treating this draft as launch-ready.

Stock rows carry a non-duplicating allocation of the existing billed parts value; package billing appears in totals and descriptive notes. When reusing a stocked item, quantities combine and its previous extended price is preserved to the cent where possible; any rounding remainder stays in the manual parts total. Inventory costs continue to come from stock history, independent of package selling price. Editing stock quantity afterward does not automatically reprice the package: review charges and authorization normally.

Each added job has a copied definition, template revision, original reviewed quote and descriptive summary. These describe the addition, not a live recalculation after subsequent manual estimate edits. Invoice snapshots retain these descriptions without adding their amounts to totals a second time. Template management is bounded to 200 recently updated entries in this first build. Automatic vehicle matching, membership billing, per-template user permission grants, and one-click reversal of an applied package are not implemented.

## QA

Automated coverage: actual rerunnable SQL migration, cross-tenant RLS, writer/tech access, exact save retry, mismatched retry, stale version, bad input, foreign stock reference, stale RO edit, approval revision, invoice snapshot, post-invoice edit lock and no template retroactive mutation. Pricing cases cover flat/itemized/mixed, premium filter allowance, cheaper substitute, extra quart, diesel quantities. UI integration tests verify stock merging, correct aggregate charges, unchanged flat labor hours, cancellation and absence of immediate financial/stock writes.

Device/browser walkthrough remains pending. Test owner creation/edit/archive/restore; writer use without catalog editing; 5-quart flat, 6-quart extra, diesel 13–15 included, itemized and mixed packages; substitute a filter; inspect estimate tax/notes; save, refresh and inspect hold counters; reapprove revised estimates; Ready for Payment consumes once and creates one invoice; inspect invoice snapshot and unchanged prior jobs after template revision. Test two simultaneous catalog edits and RO edits. Never apply this migration to Live without the normal release review.
