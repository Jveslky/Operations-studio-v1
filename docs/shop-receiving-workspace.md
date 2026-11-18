# Receiving workspace (Test)

Receiving opens with two entry cards, Receive a delivery and Receipt history, followed by five recent confirmed receipts. The orange New receipt header action is hidden on the overview and receipt-entry screen, and remains available in history and receipt details. History opens as supplier folders without a simultaneous all-receipts list. A supplier opens its deliveries in date order; a delivery opens received parts. Back to Suppliers restores the folder overview. Typing into receipt search clears any supplier selection and searches globally; date-only filters can narrow the selected supplier. Inventory keeps its category dashboard. The receipt form and catalog remain within the Receiving workspace, behind New receipt. Navigating to the overview keeps an unsaved form in memory; closing/reloading still uses the existing unload warning for receipt lines. Only unconfirmed submissions use the durable pending-request recovery path.

Apply `supabase/shop-receiving-history.sql` to Test before publishing the frontend. It adds an optional receipt `purchase_order` field, two invoker-rights history RPCs, and receipt lookup indexes. Existing inventory/AP roles, stock writes, duplicate identities and request replay payloads are preserved. AP reviewed receiving captures the same optional PO. Existing PO-less pending payloads replay without modification.

History searches supplier, PO, invoice, delivery reference and catalog part number/description/manufacturer. Supplier cards group trim/case variants only. Date filters use local midnight through the following midnight, end exclusive; displayed dates use browser local time. Read results are paged (25, server max 50). Receipt costs sum recorded quantity × unit cost before tax; catalog descriptions are current, not historical snapshots. Receipts remain immutable. This does not create purchase orders, outstanding-order balances, supplier master records or links to customer accounts.

Backup export includes the added receipt column through existing row serialization. The SQL patches the installed v3 restore function to normalize pre-PO receipt records to an empty optional PO after backup authenticity validation. The release-candidate restore source contains the same normalization.

Targeted checks: `node tests/shop-receiving-history.mjs`, `node tests/shop-receiving-history-ui.mjs`, `node tests/shop-inventory-ui.mjs`, `node tests/shop-inventory.mjs`, `node tests/shop-ap-receiving.mjs`, `node tests/shop-ap-receiving-ui.mjs`.

Rendered full desktop / split-window and deployed end-to-end review still require an authenticated Test browser. No Live changes are part of this pass.

## Source navigation

Apply `supabase/shop-receiving-source.sql` on existing Test installs. Receipt detail now includes an optional AP source only when the caller can read both the AP link and source bill under existing RLS. The original immutable receipt note stays unchanged; the exact generated `Reviewed AP bill <UUID>` note is replaced in presentation with a readable AP source label. User-authored notes remain visible. The source link opens `accounts-payable.html?bill=<id>` with that exact shop-scoped bill selected. Show all bills or changing AP search/status exits that selection. Missing/unavailable bills show a readable message. Full-shop overview metrics retain their meaning.

Receipt details use Back to Receiving or Back to supplier deliveries, based on the view that opened them. The source bill link is a separate action.
