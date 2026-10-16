# Ready for Payment → invoice draft

Saving a repair order from another status to **Ready for Payment** creates its invoice draft in the same database transaction. Staff still review the draft and explicitly issue it. No email or customer notification is sent by this change.

The draft captures saved estimate labor, parts, fee tax flags, discounts, approved supplements, customer billing contacts and terms, shop/customer tax settings, the staff actor and creation time. Its financial snapshot records `creationSource: ready-for-payment`. Existing invoices retain their snapshots and status. The existing unique RO invoice index also protects simultaneous/manual creation from duplicates.

Pending Draft/Sent supplements block the transition with an instruction to approve or decline them. Neither the status change nor a partial draft is saved on failure. As with manual invoicing, creating the invoice locks supplements. Technician completion uses the existing authorized work update; technicians gain no direct invoice write permissions.

## Install in Test

1. Use the Test Supabase project (`guvzuufdmnvurshknsnq`). Apply `supabase/shop-ready-payment-drafts-20261015.sql` after the existing invoices, estimate approvals, supplements, payment ledger and customer billing migrations. It can be rerun. It creates no invoices for historical rows and does not change their status.
2. Deploy the matching page help text, then use `https://master.long-shift-test.pages.dev` after merge, or the feature branch preview before merge. A frontend deployment alone does not install this feature.
3. Create a new synthetic RO with one hour at $100 and the shop's synthetic 6% taxable default. Save Ready for Payment. Check Invoices without manually creating anything: exactly one **Draft**, $100 subtotal, $6 tax, $106 due. It must remain Ready for Payment with no send/payment timestamp.
4. Refresh, save again, and change away/back to Ready for Payment. Verify the same invoice number, one invoice, unchanged snapshot. Also verify an RO with a preexisting manual invoice keeps it.
5. Check a customer with exemption and NET/PO requirements; confirm draft tax, billing contacts and terms, and that required PO still blocks issuing. Issuing on approved NET terms should preserve existing pickup behavior.
6. Check approved plus pending supplements. Pending work must block completion; approve or decline it, retry, and verify only approved amounts and tax flags are captured once. A failure should leave the prior RO status unchanged.
7. Have an assigned technician finish work through their normal workflow. Confirm an office user sees the draft while the technician remains unable to create/edit invoices or view office-only billing data. Verify another shop cannot complete or invoice that RO.
8. Issue and pay the invoice. Verify existing partial/full-payment, Ready for Pickup, Collected/Closed and A/R behavior. Existing paid/NET invoices must never be replaced by a draft.

## Automated validation

`npm test --prefix tests` includes a disposable PostgreSQL suite applying real migrations twice. It covers atomic creation and rollback, invoice uniqueness and manual-invoice preservation, detailed fee/supplement tax, customer exemption/NET/PO snapshots, staff actor/role boundaries, cross-shop denial, payment routing, zero rates, invalid prices, archived records and migration/import no-backfill behavior. Signed-in Test checks above remain necessary before rollout.

To disable new automation without touching invoices, drop only the `draft_shop_invoice_when_finished` trigger on `public.shop_repair_orders`. Existing invoices and financial history remain intact.
