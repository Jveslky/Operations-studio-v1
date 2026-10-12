# Shop customer authorization

Apply `supabase/shop-estimate-approvals.sql` to Test first, then Live before deploying the updated approval form. It adds estimate versions, office-readable append-only history and the private `shop-approval-evidence` bucket. No existing approvals are backfilled with invented names or dates. The form blocks new approval recording until the migration is available; ordinary RO saves remain available.

Choose Approved, select Verbal/Written/Digital, enter the customer/contact and authorization notes, optionally attach a PDF/JPG/PNG/WebP up to 10 MB, then Save. Verbal authorization requires a note. The database records the signed-in staff member and server time, snapshots the authorized work/pricing, and advances only pre-work stages. Written/digital is a staff-entered record of customer authorization, not an authenticated customer e-signature.

Changes to estimate pricing, estimate notes, work description or customer/vehicle identity increment the estimate version. Editing a previously approved estimate clears its approval to Draft; the previous evidence/history remains. Reapproval on a later work/payment stage preserves that stage. A checkbox allows another authorization record for an unchanged approved estimate. Stale approval saves fail rather than authorizing an unseen concurrent edit.

History and referenced evidence have no client edit/delete permission. Audited ROs cannot be permanently deleted because history references them; archive remains supported. Optional evidence uploads that are abandoned before a confirmed approval can remain unreferenced; they are not readable through the history policy.

Validation: `npm install --prefix tests`, then `npm test --prefix tests`. PostgreSQL tests cover real trigger execution, RLS, cross-shop/technician denial, immutable history/evidence, revisions, stale saves and payment-stage preservation. UI tests cover input validation, original-state preservation during save, revision invalidation, evidence limits, failed uploads and missing migration. Signed-in browser QA remains required after Test migration: verbal approval, written approval with PDF, reopen history/evidence, revised estimate approval on a later stage, and repeat two-shop checks against history/evidence.

## Authorization popup and work scope
Selecting Approved opens a modal. The authorizer defaults to the RO customer; Other requires a name. Approved work is Entire estimate, Custom, or Other; the latter choices require a work description. Method, verbal notes, and optional evidence stay in the popup. Confirm stages authorization for the normal RO Save; Cancel restores the prior approval status. History stores the selected scope and description alongside the complete estimate snapshot. The popup displays the current revision, approved scope, full estimate total and amount being authorized. Entire estimate uses the server-derived full total; Custom/Other requires a separate amount. The full estimate snapshot is retained separately.

Rerun `supabase/shop-estimate-approvals.sql` on Test to add scope columns and update the trigger. The migration is idempotent and preserves existing authorizations as Entire estimate.

## Amount update
Run `supabase/shop-approval-amount-update-20261011.sql` on Test; both verification columns must return true. The full migration includes this update. The new nullable authorization_amount distinguishes newly captured scope amounts from older custom authorizations whose stored amount was the full estimate. Those older records remain intact and are labeled as scope amount not recorded.

The client compares normalized current estimate/work fields to the original snapshot to display the exact revision (unchanged = original, changed = original + 1). Confirmation binds that snapshot; changes before Save require reconfirmation. The database checks the expected authorized revision against the actual saved revision and rejects invalid partial amounts. Zero is permitted for no-charge approved work. This amount records authorization and does not rewrite the estimate or invoice.
