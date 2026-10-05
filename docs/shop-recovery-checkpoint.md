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
