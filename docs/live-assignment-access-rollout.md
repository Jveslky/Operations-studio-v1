# Live QA assignment-access rollout — PR #87

## Cause confirmed

The October 5 Live preflight supplied by Jon shows membership-only SELECT policies on ROs, inspections, items, media and private inspection Storage. The work-save RPC checks same-shop role, not assignment. Only text assignment columns exist. No unresolved assignment labels were reported. These explain access surviving unassignment; PR #86's cache mitigation alone cannot revoke authorization.

## Scope

Phase 1 enforces assigned-only Tech access in TRQ&A (`b40cf910-b4df-4558-bb46-1eb18a4f4cb8`) and 2TRQ&A (`322f19e9-f0ce-492e-ada7-9f3298c16376`). It adds immutable Auth assignment IDs, QA-only backfill, restrictive RO/child/Storage boundaries and assignment checks in work/inspection RPCs. Other shops keep their existing membership/role behavior; their ROs are not backfilled. A transaction-local fingerprint rolls back the migration if any non-QA RO record changes. Existing role presets, invitations, schedule, other buckets, PFleet and Snow are unchanged.

The draft's broad floor-role candidate and unrelated frontend changes were removed. Foreman/global floor-role promotion is deferred to a separately reviewed rollout. The small frontend change exposes Auth assignment IDs and uses them on the QA Tech dashboard; non-QA dashboards retain email matching.

## Apply and verify

1. In Supabase project **amikoqrqutnpojtcyjlx**, run the entire `supabase/live-qa-assignment-access.sql` file. Never substitute Shop Test fixture scripts. Expected single result: `QA assignment enforcement installed; non-QA RO records unchanged`.
2. Keep #87 draft until the SQL success is confirmed. SQL enforcement can be verified before the frontend merge. Merge only after database success; then hard refresh.
3. In TRQ&A, Owner/Writer assigns a harmless QA RO to Tech. Tech reads it, saves notes, attaches an inspection/photo and refreshes. Owner retains the photo.
4. Owner removes both primary and additional Tech assignments. After Tech refreshes, list and direct RO URL must deny access; new inspection/photo requests and work saves must fail. Owner still sees the RO/photo. Reassigning as additional Tech restores access.
5. 2TRQ&A must not read TRQ&A UUID records or new private photo requests. Reused display RO numbers can resolve that shop's own RO; UUIDs distinguish records.
6. Existing signed URLs can remain usable until expiry. Evaluate newly authorized requests, not an already-issued link or bytes already downloaded. The #86 no-store transport remains in place.

## Local validation

`tests/live-qa-assignment-access.mjs` runs against disposable PGlite PostgreSQL with Auth/Storage stubs and the repository baseline migrations. It tests primary/additional assignment, unassignment and inactive/cross-shop denial across RO/inspection/item/media/Storage/work; Owner photo retention; Writer INSERT RETURNING; rerun safety; unchanged protected records/timestamps, role presets and legacy bucket policies; and protected Tech legacy workflow. QA dashboard identity and non-QA email fallback are tested as well. It is not a hosted Supabase API or CDN test.

No Live database was modified by the agent. The uploaded preflight is user-supplied evidence; actual enforcement still needs the SQL installation and real signed-in QA retest above.
