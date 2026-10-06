# Private media cache release

This release ports the private Storage GET/HEAD cache mitigation from Shop Test PR #85 to the existing Live Supabase client on master. It requires no SQL, data migration or permission changes.

## Evidence

In Shop Test, Tech and Test B normal SDK downloads returned the actual Test A photo (44,224 JPEG bytes with the fixture SHA-256) while fresh requests were denied. After PR #85, all 35 focused checks passed, including owner positive controls, Tech/Test B default and uncached SDK denial, UUID record isolation, restore permissions, anonymous denial and signed-link expiry. The final reports ran owner, then Tech, then Test B on October 4, 2026 at 23:02–23:03 Eastern.

## Change and limits

Private Storage object reads now use unique request URLs and fetch no-store. Existing authorization and Request options are preserved. Signed object query tokens are preserved. Public object reads, writes, REST and auth requests retain their existing transport behavior. The Live URL, publishable key and auth settings remain unchanged.

This prevents these client requests from selecting old cached responses. It does not erase saved photos, independently revoke signed links, or certify every module's storage policy. Requests outside this shared SDK client are not changed.

## Validation

Run `node --check js/supabase-client.js` and `node tests/shop-private-media-cache.mjs`. Transport tests verify sequential owner/Tech URL uniqueness, no-store, current headers, Request HEAD preservation, signed token preservation and unrelated request pass-through. Tests use mock credentials and no network calls.

## Post-deployment check

Use explicitly designated Live QA accounts and an existing synthetic QA photo only. Verify the displayed shop before proceeding. Do not use Del-Mobile or PFleet tester records. No record changes are needed.

1. Hard-refresh after deployment. As the authorized QA owner, view the synthetic photo.
2. Log out, sign in as a QA Tech without that RO assignment in the same browser profile, and confirm private photo access is denied.
3. Repeat as the designated other QA shop owner; confirm access is denied.
4. Verify the authorized owner can still view the photo after signing back in.

The Test diagnostic page is not included in this release and must not be run against Live. Do not copy its Test fixture IDs into a Live test. If API-level Live verification is needed, prepare a separately scoped read-only probe after verifying the Live QA identities and synthetic media target.

Rollback is a revert of this code release; it would reintroduce the cache behavior and should not be treated as a security solution. No database rollback is required.
