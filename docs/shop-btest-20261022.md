# Shop C guided Btest — October 22, 2026

## Stock receipt response loss

Build: b53a765bfb27dca040d21e81f28028d8d02b3c75 on test/shop-combined. Test owner, QA Shop C. No production writes or migration changes.

Jon's guided checks: Qa Filter 2 started 1 on hand / 0 held / 1 available. Offline-before-submit BTEST-RETRY-01 / DELIVERY-01 (+2 at $10) preserved the pending request and did not claim success. Manual reconnect/retry produced 3 / 0 / 3 and one +2 history entry; refresh retained 3. BTEST-RETRY-02 / Delivery-02 (+1 at $10) survived reload while pending; retry produced 4 / 0 / 4 and one +1 history entry.

Controlled database check: BTEST-LOSS-03 / DELIVERY-03, Btest Supply, +1 Qa Filter 2 at $10. Opt-in owner/admin control on the exact combined Test hostname discarded one successful RPC result before normal acknowledgment/clearing. The normal pending request remained. An independent fresh tab read 5 / 0 / 5 before retry. Reload restored that pending receipt. Retry reported success; stock remained 5 / 0 / 5. History showed exactly one +1 entry for this reference (six total movements); no duplicate receipt. Fault arm state reset on reload.

Result: stock exactly-once and pending-request reload/retry checks passed under an application-boundary response-loss injection against the actual Test database. This does not establish real transport/proxy fault behavior, full offline sync, or large-scale concurrency. AP balances were not compared before/after in this browser run, so the full case's AP assertion remains unverified. Do not mark the entire release passed.

Control: inventory?btest=receipt-response-loss on the exact Test hostname only; owner/admin with receiving permission; explicit one-shot arm. Never active by default, on other hosts, for writers/techs, or for other RPCs. Existing and additional targeted inventory UI regression tests passed; Cloudflare Test deployment succeeded. Test-only changes remain unmerged.

## AP assertion completed in repeat run

Before BTEST-LOSS-04 / DELIVERY-04: Accounts Payable rendered 3 open bills, $110.40 total payable; QA-DOC-20261022-A $20.90 Open, QA-SCAN-002 $68.60 Open, QA-SCAN-001 $20.90 Open. Captured the complete rendered main text as the comparison baseline.

Repeated the same one-shot application-boundary fault with +1 Qa Filter 2 at $10. Independent observer read 6 on hand / 0 held / 6 available before retry. Reload restored BTEST-LOSS-04. Retry left 6 / 0 / 6, removed the pending warning, and reported recorded success. History contained exactly one +1 DELIVERY-04 entry (seven total movements). Refreshed AP main text matched the baseline exactly: all amounts/statuses/counts and $110.40 payable unchanged.

Case result: PASS for controlled application-boundary receipt response loss, pending reload/retry, exactly-once stock and unchanged displayed AP. This is not real network/proxy fault injection or general offline sync. Evidence screenshot: btest-receipt-loss-04.jpg in the session artifacts. Current Qa Filter 2 baseline is 6 / 0 / 6 for subsequent tests.

## Concurrent stock allocation — same-owner browser-tab preliminary check

Created isolated QA work records RO1023 (BTEST contention A) and RO1024 (BTEST contention B) on the existing QA customer/unit. Both tabs initially queried 6/0/6. Initial automation fill did not commit the input's change event; first saves reserved 1 each, confirmed by stock 6/2/4. Reopened both and used keyboard input/blur to commit 4 each; both displayed $100 parts totals before saving. Dispatched both Save clicks using Promise.allSettled. A saved; B showed browser alert: "Insufficient available stock for Qa Filter 2. Available: 1.000; additional hold: 3.000."

Fresh reload verified A persisted 4 and B retained its original 1. Inventory showed 6 on hand / 5 held / 1 available. No overselling/negative stock. Removed each test stock line through normal Save and verified 6/0/6. Draft QA ROs remain as evidence; no invoices created. Screenshot btest-contention-counts.jpg captured the contested counts before cleanup.

Preliminary same-owner, two-tab stale-allocation contention check passed. Both tabs shared authentication/browser storage, so this is NOT the desk's full two-isolated-session check, and request overlap at the database was not instrumented. Leave overall case Not run until independently authenticated sessions/multi-connection overlap are exercised.

## Conflicting estimate edits — FAIL

QA Shop C owner, RO1023, two tabs of the same record. Both initially loaded estimate version4. A saved $40 parts; older B saved $90 without a conflict and fresh read showed $90/version6. Reproduced with an explicit intermediate server read: B retained version6/$90; A saved $40 and reopened to verify $40/version7. B then changed its older copy to $95 and saved without a rejection/reconciliation prompt. Fresh reload verified $95/version8. Newer pricing was silently overwritten by a stale draft.

Result FAIL: same-record stale edit protection missing on this exercised office draft path. No customer authorization or invoice existed in this disposable test order; those assertions are not yet exercised. RO1023 deliberately left at $95/version8 as failure evidence, no stock lines/holds and no invoice created. Screenshot btest-stale-overwrite.jpg. Requires expected-version comparison enforced atomically on the server, useful conflict handling, and retest; incrementing estimate revisions alone does not prevent a stale write.
