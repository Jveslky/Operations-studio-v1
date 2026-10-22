# Shop initial release gates

Scope: current Shop features plus document-file invoice OCR and reviewed receiving. In-app camera capture/framing and perspective correction are deferred. No production release or SQL installation is implied by a Test push.

## Document uploads

- Existing PDF/JPG/PNG upload, private original, editable OCR suggestions, explicit bill creation.
- Reviewed receiving requires catalog match, physical quantities, pack conversion, exclusions and confirmation; never automatically pays AP or adds RO charges.
- Automated parser/UI and transactional receiving tests are included in the Shop suite.
- Actual browser extraction, complete multi-page PDFs and representative supplier layouts still require verification. Camera-device OCR is outside this release scope.
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
