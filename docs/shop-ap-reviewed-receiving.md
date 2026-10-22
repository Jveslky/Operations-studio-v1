# Reviewed AP scan receiving

First reviewable slice. Requires the existing AP scanning migration, inventory foundation/permissions and `supabase/shop-ap-reviewed-receiving-20261019.sql`. Install in Test first. Merging does not install SQL.

## Workflow

1. In Accounts Payable, scan a supplier PDF/JPG/PNG or enter a bill manually. Save the reviewed vendor/reference/amount first. Scan processing blocks bill submission until it finishes.
2. Open **Review parts for receiving** on the saved bill. Both AP read permission and inventory receiving permission are required. No new financial or stock transaction occurs merely by opening this review.
3. Compare **View original document** and extracted text. The conservative parser recognizes `part-number description quantity unit-cost extended-total` rows when their arithmetic agrees. It does not claim to understand arbitrary invoice layouts. Missing/unread lines must be added manually. Review the complete source, including fees/credits/backorders.
4. Choose Receive or Exclude for every proposed/manual row. Excluded rows require a reason. Received rows require an explicit catalog match, actual delivered supplier units, stock units per supplier unit, and cost per supplier unit before tax/freight. There is no automatic catalog creation. If needed, open Inventory, create the part, then search again.
5. A case containing six filters: delivered supplier units `1`, stock units per supplier unit `6`, supplier cost `60` -> receive `6 each` at `10` each. Invoice quantity is only a suggestion, never the delivered quantity. Quantities support three decimals; stock-unit costs round to four decimals. Duplicate matches must be combined into one received row; explain excluded duplicate source lines.
6. Enter the physical delivery reference, acknowledge complete-source review and physical verification, then confirm the exact receipt summary. Existing receipt identity constraints prevent the same supplier/invoice/delivery from being received again. Different delivery references support partial shipments; they are not proof that another delivery actually occurred. Previous linked deliveries and quantities are displayed; check Inventory history for receipts entered separately.

## Boundaries and audit

- The private AP source document remains attached to its bill. Each confirmed receipt preserves an immutable complete AP snapshot, review rows including exclusions/conversions, actor ID, time, request and stock receipt link.
- The server derives supplier/invoice from the saved bill, rejects stale/void bills and checks tenant, AP access, inventory access, catalog IDs, quantities and pack conversion. Receipt plus review audit commit or roll back together. Existing stock item locking is reused.
- Receiving does not pay/update the AP bill, edit an RO, allocate a part to an RO, or create an invoice. The existing AP repair-order reference remains available; validated PO/RO routing is a later slice.
- A browser-scoped exact request is stored before sending. Ambiguous transport failures retain it for Retry same receipt after reopening; definitive PostgreSQL rejections clear it for correction. Storage failure prevents transmission. This is targeted retry protection, not general offline synchronization. Unsaved review edits are not a durable draft; closing/navigation prompts warn before discarding them.
- OCR remains on-device using the existing Tesseract/PDF.js path. PDFs up to ten pages are processed completely. Longer PDFs produce an explicit manual-review/split message rather than silently omitting later pages. Vendor-specific tables, handwriting, skewed images and ambiguous numbers may need manual entry. No confidence percentage is invented.

## Verification

Automated SQL tests use the real AP table/policies, inventory foundation/permissions and this migration twice. Cover case conversion, partial receipts, unchanged AP totals, immutable source/exclusion audit, exact replay, duplicate delivery, stale bill, invalid rows, multi-line rollback and role/tenant denial. UI tests cover conservative extraction, explicit physical conversion, pending retries, storage failure, definitive rejection and failed history gate.

Pending human QA: real supplier scans, multi-page PDFs, owner and permitted writer flows, denied roles, stale bill/reload behavior, phone/tablet/desktop layout, receipt history and counts. Actual multi-connection load testing remains part of the regional simulation. No Live migration or merge is implied by this draft.

## Shop C guided QA - October 18, 2026

Synthetic QA-SCAN-001 PDF read vendor, reference, both dates, subtotal 20.00, tax 0.90 and total 20.90 correctly after fixing decorative-heading/reference and subtotal/total parsing. Received two QA-Filter-1 at 7.50 each, delivery QA-DEL-001. Stock increased from 4/0/4 to 6/0/6 and persisted; AP remained 20.90 Open. Reopening showed the linked delivery, quantities, receipt ID and timestamp. Filter history showed +2, actor and time. Repeating the same delivery was rejected, and Jon confirmed unchanged inventory and duplicate rejection.

Final display fixes expose the supplier/invoice/unit cost already returned by the combined stock history RPC and translate the duplicate receipt identity error into a clear no-additional-stock warning. Automated checks cover receipt details even when receipt_id is absent from that RPC response. Neither fix requires new SQL. Browser verification of these final display fixes remains pending, along with real supplier layouts and phone/tablet QA.


## Initial release scope

Upload existing PDF, JPG or PNG files for on-device OCR and explicit bill/parts review. Camera capture, corner framing and perspective correction are deferred. Existing image uploads use the original image directly.
