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

## Payment retry and reversal — controlled same-dialog checks PASS

Build c4d419974db1d5d14bf1ef9f0bd896cbce00414c on combined Test. Existing disposable QA invoice1012, $68.90 total, $0 net paid/$68.90 due; prior $1 and -$1 reversed test history preserved. Recorded BTEST-PAY-01 $10 Cash => $58.90 due. Recorded BTEST-PAY-02 $15 Check with opt-in application-boundary accepted-response loss; original dialog displayed injected error while an independent tab read one $15 entry, $25 net paid/$43.90 due. Retried unchanged in the same dialog: still one entry/$43.90 due.

Reversed $15 with reason BTEST-REV-02 and another injected accepted-response loss. Independent tab showed one -$15 reversal/$10 net paid/$58.90 due before retry. Same-dialog retry retained one reversal/$58.90 due. Reversed the $10 entry normally with BTEST-REV-01 cleanup. Reload verified six entries including the original legacy QA pair, both new payments retained and marked reversed, one matching reversal per payment, $0 net paid/$68.90 due. No card charge, refund, notification/send action or actual money movement. Screenshot btest-payment-recovery.jpg.

Scope: same-dialog retry using retained operation key and controlled application-boundary fault, not real transport loss. Pending payment key is not durable across dialog close/reload; reload recovery remains a gap, not passed. Reversal payment_date rendered 2026-10-23 while recorded local timestamp was 10/22 evening; SQL uses current_date. Shop settings displayed unset timezone (select shop timezone and save profile), so record timezone configuration/date semantics as follow-up rather than infer configured-zone failure. Core case assertions (partial/split balances, same-key response-loss retry, preserved history and exactly-once reversal) passed within this scope.

## Document interruption and recovery — scoped PASS with follow-ups

Build c4d419974db1d5d14bf1ef9f0bd896cbce00414c, QA Shop C owner. Corrupt PNG retained the original for manual entry, left required vendor/amount missing, and could not create a bill. Error text ended in literal "undefined" (polish defect). Cancel after scan completion reset the form. Two-page synthetic PDF extracted QA PDF SUPPLY / QA-PDF-20261022-B and $20.90 total from page two; captured OCR included PAGE TWO VERIFICATION and END OF INVOICE. Cancel during active scanning was blocked/ignored; cancellation succeeded after completion. No claim of immediate in-flight cancellation.

Reloaded another upload while "Uploading the original privately…" was visible. AP remained three open bills/$110.40, with no false bill creation. Interrupted-upload orphan storage cleanup was not verified and draft recovery was not established. Existing QA-DOC-20261022-A View Document opened the saved original; screenshot btest-document-original.jpg visually verified readable source, reference, lines and $20.90 total. No signed URL retained in this log. Targeted shop-ap-scan-ui and shop-ap-receiving-ui checks passed.

PASS applies to exercised bill-safety validation, multipage OCR, completed-scan cancellation, reload not creating bills, and saved-original access. Follow-ups: meaningful decode error text, clearer busy/cancel behavior, and verification of interrupted-upload storage cleanup.

## RO stock lifecycle after disruption — reload/repeat-action checks PASS

Build c4d419974db1d5d14bf1ef9f0bd896cbce00414c, QA Shop C owner, disposable RO1024/Qa Filter 2. Started 6 on hand/0 held/6 available. Initial ArrowUp advanced by 0.001 (configured quantity step), saving 1.001; corrected with committed keyboard change to exactly 2, confirmed 6/2/4. Reload retained reservation. Declined estimate released two =>6/0/6. Restored Draft with quantity1 =>6/1/5. Confirmed Ready for Payment =>5/0/5, created one draft invoice1017/$26.50. Repeated save and reopened In Progress left5/0/5. Explicit physical return1 with BTEST lifecycle cleanup reason restored6/0/6. Another new return of1 was rejected: remaining consumed quantity0.000; count unchanged. Reload and confirmed Ready for Payment again retained6/0/6. Invoice directory contained only one RO1024 invoice1017, still Draft/$26.50; physical return does not issue a financial credit. No sends/payments/real goods moved. RO1024 remains Ready for Payment with this draft evidence invoice.

History verified exactly one new RO1024 consume(-1) and one return(+1), with source RO, reason, staff and timestamps. Evidence btest-stock-lifecycle-history.jpg and btest-stock-lifecycle.jpg. QA-Filter-1 independently displayed one hold during this test; it was not modified or attributed to this case.

Targeted tests shop-ro-inventory-ui.mjs and shop-ro-inventory.mjs passed. The latter exercises exact same-request return replay and simulated invoice-trigger failure rollback in local PGlite; distinguish these from live Test evidence. Live checks used reload, repeated saves/transitions and excess-return rejection, without injecting RO transport/accepted-response loss. Result PASS for these documented scopes; general offline sync and transport interruption remain unverified.

## Wide desktop and phone visual pass — partial; overall BLOCKED

Combined Test c4d419974db1d5d14bf1ef9f0bd896cbce00414c, QA Shop C owner. Live browser viewport1363x936. Inspected dashboard, Parts, Add part editor, Receiving, Prebuilt Jobs catalog and mixed-template editor, Alerts & Preferences dialog, grouped navigation and utility notifications. Dashboard and inventory editor measured page scrollWidth1348 within viewport1363; prebuilt catalog likewise1348. Prebuilt editor rect top20/bottom916 within936 viewport, internally scrollable; heading and Calculate review/Cancel reachable. Calculated review then cancelled without saving template. Notifications menu top666/bottom845 opened above utility bar, fully within viewport. No new business data saved in visual review.

Standard-desktop inspected views show no observed blocking clipping. Styling follow-up: Alerts & Preferences retains plain default-looking links/buttons compared with surrounding Shop controls. This is visual polish, not a newly demonstrated access failure. Evidence btest-desktop-visual.jpg.

Overall case BLOCKED pending actual phone-width and wide-monitor review. Current browser API exposes no supported viewport-resize control.1363px is not a >=1600 wide-layout check; no mobile or wide pass inferred from CSS/source, historic screenshots or standard-desktop results.

## Roles and tenant isolation — live role subset passed; overall BLOCKED

Combined Test c4d419974db1d5d14bf1ef9f0bd896cbce00414c. Secure sign-in to QA writer produced Service Writer Workspace / QA Shop C. Inventory direct route allowed catalog read/history/Add to receipt, omitted Add part/Edit/Correct count and owner-only Test fault control. Direct AP route redirected to writer dashboard. Account menu omitted Users/Shop Settings. No writer mutations attempted.

Secure technician sign-in produced Technician Workspace / QA Shop C. Direct unassigned RO1023 returned Repair order not found without record content. Assigned RO1022 loaded; all seven pricing spinbuttons disabled, office authorization controls absent, stock row read-only, no Create Invoice action. Direct AP and inventory routes redirected to technician dashboard. No technician work edits or storage URLs attempted. Evidence btest-tech-route-guard.jpg.

Requested separate-shop sign-in, but resulting session again showed QA Shop C owner workspace, not an independent shop identity. Do not treat that as evidence of cross-shop leak or denial. Need a verified different-shop account plus live record/attachment attempts to complete the case. Existing owner functionality exercised in prior cases; live owner-admin distinction and attachment boundary not completed here. Session left signed into QA Shop C.

Automated shop-page-access.mjs and live-qa-assignment-access.mjs passed. Despite its filename, the latter uses disposable local PGlite with Auth/Storage stubs and no Supabase connection; covers assignment/removal, inactive/cross-shop denial and storage policy paths. This supports regression coverage but does not replace pending live separate-shop checks. Overall BLOCKED, with live writer/technician subset passed.

## Live separate-shop record checks completed

After user retried secure authentication, fresh workspace positively identified Long Shift Shop Test B, with five open ROs and no open invoices. Prior failed login returned Invalid login credentials; no identity or isolation conclusion inferred from that failed attempt. Shop B direct attempt at Shop C RO1023 returned Repair order not found. Direct attempt at known Shop C invoice1012 using its UUID returned Invoice not found or unavailable, with no invoice data or payment actions. B inventory showed no matching parts/zero catalog items rather than C filters; B AP showed zero bills/$0 payable and no vendor bills/document links rather than C three/$110.40. No mutations performed. Evidence btest-cross-shop-invoice.jpg. Browser remains signed into Shop B.

Live writer/technician restrictions and separate-shop record/list checks passed within the exercised subset. Private-storage direct object access/signing denial was not tested live; absent AP document links alone do not establish that boundary. Keep full Roles and tenant isolation case BLOCKED pending direct attachment boundary verification (plus any desired admin-specific path); local automated storage coverage remains supporting evidence only.

## Independent allocation retest blocked by writer creation failure

Owner created disposable RO1025, BTEST independent allocation — owner retest, QA C Cust/2020 fisher price. Staged quantity4 Qa Filter2 without Save; search baseline6/0/6. Awaiting user's independent writer session. RO1023 stale-edit evidence and invoiced RO1024 were not repurposed.

Jon reported writer new-RO submission failed with Assignment permission required. User screenshot identifies tr.qa.writer+c@proton.me as Service Writer/Active. Fresh owner Users & Permissions route independently showed that account saved as service writer, enabled, with checked inventory/AP/request/document/export/user-management controls. No access settings changed. These controls omit repair_orders.write; checked unrelated permissions do not establish that effective permission. Repository sync_shop_ro_assignments trigger checks repair_orders.write on every INSERT, including unassigned orders. All repository writer presets include that permission; local writer INSERT RETURNING regression previously passed. Live effective RO-write override/function state is not exposed by this UI, so root cause remains undetermined. Capture as user-reported live writer creation failure, not stock-overallocation evidence. No competing allocation saves were performed.

Status reconciliation: Jon explicitly reports Concurrent stock allocation had already failed and asked to retain Fail. Preserve his failure entry; the separate earlier same-owner stock-shortage rejection and the independently reproduced stale-estimate overwrite are distinct evidence. Do not infer the user's earlier failure mechanism from this new permission error. Live roles case now includes a legitimate-writer workflow failure requiring investigation/retest; prior restrictive access checks still stand within their scopes.

## Independent owner/writer allocation — stale-availability retest PASS

Owner created blank RO1026 for writer existing-order retest because writer new-order submission was blocked. User independently signed in as Shop C writer in their own browser, opened1026 and staged4 Qa Filter2. User screenshots first showed input4/description1; after blur the later screenshot confirmed description4 each x$25. Owner RO1025 independently staged4 from6/0/6. Owner saved first; fresh cloud inventory read6/4/2. User submitted unchanged older writer draft. Screenshot image(20261023-023849).png shows RO1026 and server alert: Insufficient available stock for Qa Filter2. Available2.000; additional hold4. Fresh read stayed6/4/2; separately reopened writer RO1026 had zero saved Qa Filter2 rows and empty parts total; owner1025 persisted4. Removed owner stock line through normal Save; fresh inventory restored6/0/6. Both disposable orders remain blank drafts, no invoice or consumption. Evidence btest-independent-allocation-cleanup.jpg plus user's shortage screenshot.

PASS for independently authenticated owner/writer stale-availability rejection. Saves were deliberately sequenced, not simultaneous DB-overlap load; no claim of transport loss or multiconnection stress. Preserve earlier user-reported Concurrent stock allocation Fail/history until its separate original mechanism is reconciled. This new scoped pass does not erase the writer-create failure or reproduced stale-estimate overwrite. User's writer page still has rejected unsaved4 draft; instruct discard/close rather than retry after cleanup.

## Repair pass — 2026-10-23

Office stale-save fix deployed in Test commit 575ca50, followed by writer diagnostic 09ecd88. Live same-owner two-tab retest on RO1025: first save parts40 succeeded; stale parts95 save raised an alert and retained the unsaved draft; separately reopened persisted record remained40. No stock/invoice mutations. Original RO1023 failure evidence retained. This verifies office saves, not technician RPC concurrency. Evidence btest-stale-save-fixed.jpg.

Writer creation reproduced independently through secure writer sign-in. Saved effective permission summary allows RO creation; current authenticated shop_has_permission read also returned true after failed INSERT. No permission settings changed and no order created. Exact deployed trigger definition was not retrieved; deployment drift/record-based pre-insert authorization is a hypothesis, not a confirmed live definition.

Focused Test SQL: supabase/shop-ro-assignment-create-repair-20261023.sql replaces assignment trigger function with active office-role plus repair_orders.write checks before row existence; retains QA scope and active in-shop assignment resolution. No role presets, memberships or RLS changes. Local PostgreSQL regression simulates record-based BEFORE INSERT denial, applies repair twice, verifies writer assigned/unassigned creation and invalid assignment denial plus existing technician/inactive/cross-shop/storage restrictions. Passed. Live SQL application and writer creation retest remain PENDING; no database execution capability available in this session.

Targeted UI regressions passed: stale save conflict/draft retention/stock preflight, stocked parts, supplement consumption and durable return retry, labor default, approval revisions/tax, writer denial diagnostics without duplicate INSERT. UI fixture timestamps updated to match optimistic concurrency contract. User's stock/prebuilt cohesive design pass remains queued. Earlier concurrent allocation Fail is preserved alongside scoped independent stale-availability rejection pass; no release approval inferred.


## Correction after live function export — 2026-10-23

User applied initial repair, but writer create then failed because live_qa_assignment_scope(uuid) does not exist. Exported live functions confirm the deployed model has no QA-scope helper and shop_can_access_ro uses repair_orders.assign separately from repair_orders.write. Earlier suspected record-based trigger cause was not established; original trigger definition before replacement was not captured. Initial repair was incompatible with deployed dependencies; do not reuse its prior content.

Corrected same repair file removes the missing helper dependency and matches installed global assignment resolution. An active office member needs repair_orders.write to INSERT; unassigned INSERT does not need repair_orders.assign. Assigned INSERT and any assignment change/removal require repair_orders.assign, with technician role excluded. Foreman is retained among office roles matching installed resolver. Existing RLS, grants and role presets remain unchanged. Dedicated disposable PostgreSQL test covers missing helper, rerun, separate permissions, ordinary edits, assignment removal/UUID changes, invalid labels, inactive and technician rejection. Passed. Existing QA-scoped legacy access suite remains a separate test of its own migration, not a substitute for live-global repair coverage. Corrected SQL application and live retest PENDING.

## End-of-night handoff — writer creation retest

Jon reports unassigned writer RO creation succeeded after corrected SQL. User-reported live PASS for unassigned creation; new RO identifier not captured. Screenshot image(20261023-031411).png shows assigned creation denied with technician tr.qa.tech+c@proton.me selected. Assignment remains OPEN: inspect deployed service_writer preset and writer+C permission_overrides before changing intended access. No assignment permission granted during this pass. User explicitly expects writers to assign technicians; retain technician and tenant boundaries. Do not mark the full role case passed.

Next session: obtain deployed shop_role_permissions(text) and shop_has_permission(uuid,text) definitions plus writer+C saved/effective repair_orders.assign values; repair intended writer assignment access and retest assigned creation/reassignment, technician denial and cross-shop rejection. Repository legacy presets do not expose repair_orders.assign, so avoid replacing a live preset with the older repository version. Then plan East Coast Dday simulation. Offline queue/reconnect, inventory-inclusive restore, AP ambiguous-save recovery, durable payment retry after reload, live private-attachment isolation, full wide/phone visual coverage and real supplier invoice checks remain pending as previously scoped. Simulation preparation is not release approval. Preserve original concurrent allocation failure history and scoped subsequent pass separately. Stock/prebuilt design polish remains queued. User requested stopping after tonight's final pass.

## Writer assignment investigation — resumed

Signed in as QA Shop C service writer. Added read-only saved-assignment status and source to Test Users page. The live page shows both active QA C service writers denied technician assignment with source role preset, not an individual override; QA C technician also denied by preset. No access settings changed. Prepared supabase/shop-writer-assignment-preset-repair-20261027.sql: retains installed role preset through a captured helper and adds repair_orders.assign only to service_writer. Existing individual override precedence is retained. Disposable PostgreSQL checks passed for repeat application, preserving existing permissions, explicit denial override, technician denial and inactive membership. Live database execution and assigned-RO retest pending. Confirm target Test database and role preset function input signature before applying; no production deployment.

## Writer assignment live retest

Jon reports applying the writer assignment preset SQL in Test. In QA Shop C, refreshed Users & Permissions shows assignment allowed by role preset for both service writers and denied by role preset for the technician. Signed-in Service Writer created RO1028 for QA C Cust / 2020 fisher price with tr.qa.tech+c@proton.me assigned and complaint BTEST writer assigned RO verification. Detail reopened after reload with that technician selected. Scoped PASS for writer assigned creation and persistence; no stock or invoice created. Technician assignment denial and cross-shop checks were not re-exercised live during this retest; local regression coverage and earlier live read-boundary evidence do not substitute for a new live role isolation retest. Original Btest failures retained.

## Live assigned technician and cross-shop retest

Signed into QA Shop C technician workspace. RO1028 appeared under assigned work and opened with both technician assignment controls disabled. Entered BTEST technician work-save verification in Technician Notes, saved and reopened; note persisted, status remained Open and the primary assignment remained unchanged. This confirms UI controls and the normal work-save path; no direct forged API assignment request was attempted.

After confirming Long Shift Shop Test B workspace, opened the known Shop C RO1028 URL. The page returned Repair order not found and showed no Shop C record content. Evidence btest-shopb-ro1028-denied.jpg. This is a scoped cross-shop RO read check, not a live private-attachment or cross-shop write test. Test note remains on RO1028; no invoice or stock change.

## Cross-shop private AP document link retest

Added a Test-host-only owner/admin Berserker desk control to request a short-lived link for an entered disposable AP document path; it reports result without displaying the signed URL or retaining the path. Existing QA-DOC-20261022-A path was obtained from its visible View Document control. As verified QA Shop C owner, storage granted a link. After secure sign-out and verified Long Shift Shop Test B owner sign-in, the same path produced a storage error and no link. Screenshot btest-private-ap-shopb.jpg records the negative result (input cleared after check). Scoped PASS: cross-shop signed-link issuance for this private AP object, with positive control. This does not independently test raw download endpoints, other storage buckets, or all roles; overall role isolation case remains scoped accordingly. No AP records or document files were modified.

## Payment accepted-response loss followed by reload — recovery gap confirmed

QA Shop C owner, invoice1012, controlled application-boundary payment-response-loss fault. Baseline $68.90 total/$0 paid/$68.90 due. Submitted $1 cash reference BTEST-PAY-RELOAD-01, notes disposable Test ledger/no money moved; dialog displayed injected response-loss error after server acceptance. Reload showed exactly one matching payment, $1 net paid/$67.90 due; reopened payment dialog was a fresh form with $67.90 amount, empty reference/notes, and no pending-recovery notice. Source review indicates the same-dialog operation key is not durable across reload; no second payment was submitted, so duplicate-on-retry was not demonstrated. Recovery after reload remains a FAIL/gap for explicit durable pending-state recovery, with duplicate risk rather than observed duplication. Fault is application-boundary injection, not real network failure.

Reversed the single $1 Test payment with BTEST-PAY-RELOAD-01 cleanup; verified one reversal, $0 net paid and $68.90 due restored. No actual payment or refund. Evidence btest-payment-reload-cleanup.jpg. Do not confuse with earlier scoped PASS for same-dialog exact-key retries.
