# Operational alerts — second slice

Apply `supabase/shop-operational-alerts-20261021.sql` in Test after the merged personal-alert migration and the existing inventory, RO-stock, payment-ledger, team-document and request migrations. Do not rerun the older personal-alert migration over this extension. This change is separate from unmerged prebuilts/scanner work. No historical alerts are backfilled and no money or stock values are changed by this migration.

| Event | Recipients and current access | Trigger |
| --- | --- | --- |
| Low stock | Office users with inventory read access | Available quantity crosses from above to at/below reorder point |
| Payment recorded | Office users with invoice read access | A positive payment is inserted into the authoritative ledger |
| Team document shared | The document's subject, only while explicitly shared and unarchived | First visible insert/share of that document |
| PTO requested | Office users with requests.review | New pending PTO request |

Shop available/required rules and personal preferences apply to future deliveries just as they do for assignment/authorization alerts. Users only see preference types their current role and permissions allow. Current access is checked on each feed/read operation; delivery history never grants record access. Private document titles and request details are not copied into alert text.

## Event semantics

Low stock uses **available**, consistent with the inventory Low filter: on hand minus holds. Existing low items establish a silent baseline. New empty items also initialize silently. Receipts, corrections, reservations, consumption, returns, archive and reorder-point changes re-evaluate state. Unchanged saves or more reductions while already low do not spam alerts. Recovery resolves the episode; a later crossing creates a new episode. A per-item row lock serializes the check with stock operations. No stock is altered by alert processing.

Payments are **staff-recorded ledger payments**, not verified online checkout payments. There is no installed web-payment callback to connect yet. The trigger excludes legacy/restored historical entries and reversals; a reversal resolves the original payment alert. Provider-confirmed web alerts remain future integration work. No payment is created by alert delivery.

Team documents notify the subject only on first sharing. Hiding or archiving removes feed access; re-sharing does not generate another delivery. This slice does not announce private uploads to all office users or send alerts to a newly changed document subject. The document link retrieves the current authorized document row and a short-lived private-storage URL.

PTO approval/decline resolves the submission alert. Medical/general requests are not emitted by this slice. Existing office request notifications remain intact.

Resolved events stay in accessible history but no longer count as unread. Read and Resolved are separate states. This is in-app delivery with a one-minute visible-tab poll and explicit refresh, not email/SMS/push.

## Checks

Full regression suite plus `shop-operational-alerts.mjs`; the latter covers migration reruns, low episodes/recovery/re-crossing, holds and consumption, private/share/hide/archive document access, PTO resolution, payment/reversal/restore behavior, tenant and permission isolation, private delivery helper denial and transaction rollback. UI coverage checks operational destinations and resolved labels. Mobile checkbox labels use locally scoped flex styling to prevent page-level form rules separating labels from controls.

Manual Test QA remains pending:
1. Owner Alerts shows new eligible preferences; technician sees shared documents plus existing assignment/authorization options, without office financial/inventory/PTO options.
2. Inventory: choose a stocked part whose available quantity is above its reorder point. Raise the reorder point to its available quantity and save. One low-stock alert appears. Save unchanged: no extra. Lower threshold below available: original resolves and unread count drops. Raise again: exactly one new episode.
3. Tech submits a synthetic future PTO request. Office gets one alert linking to Requests; review resolves it. No sensitive request details should appear in alert text.
4. Upload a test document privately for the tech: no subject alert. Share it: one alert; its link opens the private document. Hide/archive: the alert disappears from the tech feed. Re-share: no duplicate.
5. On a disposable Test invoice, record a small payment through the normal office flow. One accurately labeled Payment recorded alert appears. Exact request retry does not duplicate it. Reversal resolves the original; no second positive-payment alert is emitted.
6. Confirm personal opt-outs and shop-required/disabled controls work on an operational type. Removed relevant permission hides its feed content.
