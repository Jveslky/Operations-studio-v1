# Shop Test recovery checkpoint

October 4, 2026: Jon verified new-customer RO creation and persistence; primary/additional Tech assignment removal denies RO access while Owner retains photos; Test A/B respective numeric RO lookup; same-shop backup preservation and other-shop UI rejection. Missing synthetic customer restored once, repeat import kept five customers. Missing synthetic appointment restored once; three imports kept two appointments. Signed-in API isolation and signed storage URL expiry remain pending.

## Recovery v3

Includes the existing eight business datasets plus inspection response sets/options, templates/sections/items, inspection snapshots/results/notes, media metadata and actual photo/video bytes with SHA-256 integrity checks. Files use the original private bucket paths. Existing rows and file bytes are preserved. v2 imports remain supported. This is a same-shop recovery format, not a cross-project migration.

Team documents, shop settings and notification history remain excluded, explicitly disclosed. Browser recovery is limited to 250 MiB media (350 MiB JSON import). Larger backups fail explicitly; no silently incomplete download. Browser memory can exceed file size; large-shop streaming archives remain future work. Export reads are sequential, not a database snapshot: perform backup while work is paused. Auth user IDs must still exist in the original project.

Database restoration is transactional; storage is a subsequent phase because PostgreSQL and object storage do not share a transaction. A storage error reports an incomplete import; re-import the same file to resume. Never overwrite existing objects. Hash conflicts stop restoration. The existing RLS and storage policies stay in force.

## Installation and signed-in test

1. Run `supabase/shop-test-recovery-media.sql` in **guvzuufdmnvurshknsnq only**. Exact Test A/B IDs are guarded; no business records are changed on installation. Do not run on Live, Snow, original Shop QA, Del-Mobile or PFleet.
2. Deploy the proposed interface to the Test site after review. Existing Live stays unchanged.
3. In Test A, select a disposable RO containing one inspection with an answered item/notes and one small photo. Export v3. Check inspection/media counts and `media_files`, then upload the file for a narrowly scoped new-ID fixture. Do not delete existing records to simulate loss.
4. Import the scoped fixture. Verify inspection responses/notes and photo rendering after refresh. Repeat import; counts stay unchanged. Test B rejects the Test A file. Separately validate API rejection and photo storage access as unauthorized Tech/Test B.
5. Simulated PostgreSQL and storage tests pass; actual Supabase installation, file upload, UI flow, real-role API and signed URL expiry tests are pending. Do not call the entire platform certified or fully recoverable.


## October 4 signed-in recovery results

PR #81 merged into shop-test; Jon reports SQL installation successful in Shop Test. Test A restored one synthetic inspection, one answered item/note and one photo at a new object path. Refresh and repeated imports preserved two inspections/two photos on RO #1002. Test B rejected the same backup. Original backup photo sizes and SHA-256 digests verified locally. Actual video recovery and missing template/response-set recovery still need signed-in tests.

## Direct security checks

Test-only `qa/shop-security.html` runs from the current browser Test session. It verifies the Supabase host and exactly one active Test A/B membership. It probes UUID-based RO, inspection, item and media reads; private-photo download/signing; anonymous record/photo reads; and server import permissions with an empty backup payload (zero writes). Test A owner is the positive control; Test A Tech and Test B owner must be denied the selected Test A records/photo. Keep RO #1002 assigned to Writer and not Tech until tests finish. The synthetic imported media is internal-only.

Run as Test A owner, Tech, then Test B owner. Owner also checks the issued 30-second signed link after 45 seconds using the expiry button. Download each JSON report and upload for review. Reports contain no session tokens, signed links, photo bytes or user IDs. Existing signed links are bearer links until expiry, not immediately invalidated by reassignment.

The browser connection failed earlier; real signed-in probe runs remain pending. Local mock tests verify the test-page expectations only. Team documents/settings/notifications remain excluded from recovery; do not call this a complete platform backup or full security certification.

## Signed-in probe reports received

October 4, 22:29 Eastern: Test A Owner, Test A Technician and Test B Owner report successful expected UUID record access/denial, photo signing authorization, restore permissions and anonymous RO denial. Owner photo-byte positive control passed. Tech/Test B/anonymous direct SDK-download denial checks failed with no error details retained. No conclusion about byte exposure is possible from these reports. Owner signed-link expiry is absent.

Probe v2 performs a raw authenticated Storage HTTP read and records status plus photo bytes received, retaining SDK error name/status as a separate comparison. It never puts bearer credentials or signed links into reports. Owner signed-link expiry runs automatically after 45 seconds and report download stays disabled until the attempt finishes. Rerun all three sessions; no SQL or policy changes are made by this diagnostic correction.
