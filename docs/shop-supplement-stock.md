# Stocked supplemental estimates

Apply `supabase/shop-supplement-stock-20261019.sql` to Test after all PR108 migrations, including `shop-approval-tax-20261019.sql`. Deploy the matching UI after SQL. The migration is rerunnable, with no historical stock backfill. Older clients cannot record new supplement authorizations after installation; reload to the new preview.

## Behavior

- Saving stocked lines reserves inventory for that supplement, including Draft/Sent work. On hand includes reservations; Available = On hand − On hold.
- Each baseline/supplement has its own ledger source. The same item can appear across multiple estimates without holds overwriting one another.
- Quantity/removal changes adjust holds atomically. Approved revisions become Draft and require separate fresh authorization. Declining an approved supplement creates a new revision and releases its hold while retaining the historical authorization.
- Decline, parent cancellation and archive release unconsumed holds. Restoring work reacquires stock only if available. Shortages reject the entire save/transition.
- Ready for Payment requires approval or decline of pending supplements, plus human confirmation of the saved baseline and all approved, unconsumed supplement revisions. Assigned technicians can confirm/finish through the existing authorized RO operation; they cannot edit supplement pricing or access supplement authorizations.
- One stable item-lock order covers baseline and supplement operations. Consumption, status transition, invoice draft and immutable supplement snapshots share the database transaction. Any downstream failure rolls back all of them.
- Settlement is per supplement. Reopening never replenishes or consumes again. Existing invoice locks remain: additional work after invoicing is not introduced in this slice.
- Owner/admin physical returns are tied to the exact baseline or supplement and cannot exceed that source's remaining consumed quantity. Returns preserve actor/time, RO number, supplement number and reason. They do not credit invoices. Browser-persisted request arguments support deliberate retries after an ambiguous response; this is not general offline editing.
- New supplement authorizations record tax-inclusive amounts and a server-calculated tax snapshot. The client-confirmed total must match current shop/customer tax settings. Historical records are unchanged; historical records without captured tax are labeled accordingly. Approved revision displays prefer their saved authorization tax snapshot. Existing invoice tax calculation and rounding rules remain in place.

## Test walkthrough

Use Shop C owner and a fresh RO; RO #1009 is already invoiced and locked. Start with QA-Filter-1 at 5 on hand / 0 on hold / 5 available.

1. Create/save a fresh RO. Add 1 filter to its baseline estimate and save: **5 / 1 / 4**.
2. Add a supplement with description “Additional filters,” search QA-Filter-1, add quantity 2 and save: **5 / 3 / 2**. Parts subtotal $30; supplement total $31.80 with the current 6% tax.
3. Approve the supplement and inspect its captured lines/tax/identity. Edit quantity 2 → 1 and save separately: new Draft revision, old authorization preserved, **5 / 2 / 3**. Reapprove the $15.90 revision.
4. Approve the $15.90 baseline separately. Move Ready for Payment. The prompt lists baseline 1 plus supplement 1, each with its source. Confirm: **3 / 0 / 3**, one invoice totaling **$31.80**, including the approved supplement once.
5. Reopen In Progress and return Ready for Payment: counts and invoice count unchanged.
6. On the supplement card, Return unused stock: quantity 1, reason “QA supplement physical return.” Counts **4 / 0 / 4**; history includes RO and Supplement 1, actor/time. Invoice stays $31.80.
7. A second supplement return must be rejected; the baseline's consumed filter is a separate source. Return that through the baseline editor if resetting the fixture: **5 / 0 / 5**.

Separate cases: decline/cancel/archive releases; restoring with insufficient stock fails atomically; a competing RO cannot reserve unavailable stock; a writer without inventory access cannot change stock lines; an unassigned technician/other shop cannot retrieve the consumption manifest. Test desktop and narrow viewport rendering of the supplement dialog.

## Verification and limits

Automated PostgreSQL tests use the actual approval, inventory, billing, payment, ready-payment invoice and supplement migrations. They cover migration replay, shared-item source isolation, approved quantity revisions, shortages, cancellation/archive/restore, immutable tax snapshots, stale confirmation, actual invoice failure rollback, assigned-tech completion, exact-once reopening, immutable invoice snapshots, bounded source returns and role/tenant isolation. VM UI tests cover supplement-only consumption confirmation, cancellation/read failure without writes, authorization amounts and durable return retries/storage failure.

Human browser walkthrough and real multi-connection concurrency/load tests remain pending. The latter belongs in the regional stress simulation. Scanner integration, prebuilt jobs, post-invoice supplemental work, invoice credits and general Shop offline synchronization are separate work.
