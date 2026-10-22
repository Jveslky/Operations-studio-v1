# Shop initial release gates

Scope: current Shop features plus document-file invoice OCR and reviewed receiving. In-app camera capture/framing and perspective correction are deferred. No production release or SQL installation is implied by a Test push.

## Document uploads

- Existing PDF/JPG/PNG upload, private original, editable OCR suggestions, explicit bill creation.
- Reviewed receiving requires catalog match, physical quantities, pack conversion, exclusions and confirmation; never automatically pays AP or adds RO charges.
- Automated parser/UI and transactional receiving tests are included in the Shop suite.
- Controlled browser verification passed for an uploaded image (saved at $20.90, reload and original attachment) and two-page PDF extraction with page-two totals (cancelled without bill creation). Representative supplier layouts remain unverified. Camera-device OCR is outside this release scope.
- Include reviewed receiving SQL in the deployment plan; Test and Live schemas must be verified separately.

## Visual conformity

Review owner/admin, writer and technician pages at desktop and phone widths. Preserve the accepted charcoal/cream/orange/cyan design; correct overflow, navigation, spacing, dialogs, controls and empty/error states.

## Berserker / recovery

The simulation is a release gate, not proof that missing recovery features exist.

- Full Shop offline-write queue, persistent offline banner and sync/conflict UI remain implementation/verification work; targeted inventory/receiving retry support is already present.
- Extend scoped backup/restore to include inventory ledgers, receiving/audit records and operation IDs, then rehearse a restore.
- Test dropped/ambiguous responses, interrupted saves, reload and reconnect, same-request retries, conflicting edits, duplicate financial/stock requests, permissions and tenant isolation.
- Explicitly verify AP bill creation recovery after an ambiguous response, including preservation of the original document; simultaneous-click protection alone does not cover this.
- Run real multi-connection stock contention and recovery tests. Record failures, fixes and retest evidence.

## Release preparation

Reconcile the combined Test work with outstanding PRs, rerun affected checks, review migrations and rollback/recovery procedures, and obtain release authorization. Test deployment is separate from merging or releasing Live.

## Btest desk

`pages/Shop/btest.html` is a Test-host-only manual run journal for owner/admin accounts. It loads the normal Test authentication, records results and evidence in shop/user-scoped browser storage, and exports JSON. It does not inject faults or execute the scenarios. No scenario begins passed. Offline queue, inventory-inclusive restore and ambiguous AP creation recovery begin blocked. Marking a pass requires a build reference and evidence notes. Browser storage failures remain explicit; exported evidence is needed for portability. Up to 50 recent runs are retained locally.

Wide dashboard layout activates at 1600 CSS pixels and above. Mobile keeps the existing responsive layout. Physical 27-inch display verification depends on screen resolution and browser scaling.
