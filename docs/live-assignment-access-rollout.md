# Draft Live assignment-access promotion

## Observed gap

Jon reported Live TRQ&A RO #1003 remained visible to Tech with its photo after assignment removal on October 5, 2026. Live repository code still uses broad same-shop RO permissions. PR #86 only ports private-media cache mitigation. Installed Live database policies have not yet been inspected.

## Draft contents

Frontend is the tested PR #78 floor-role implementation, including extensionless route guards inherited from Test. It adds Foreman navigation/assignment workflow and immutable technician assignment identities. This does not bring inline intake, recovery, Test connection settings, or diagnostic fixtures into Live.

The SQL candidate is the tested floor-role migration with the corrected direct-row SELECT policy for INSERT RETURNING. It is deliberately blocked by an unconditional STOP before any changes. Do not remove the STOP or run it as an installation script. It contains a whole-Shop assignment backfill and role preset changes that require review; it must not be applied while protected data scope is unresolved.

## Required next input

Run `supabase/live-assignment-access-preflight.sql` in Live project `amikoqrqutnpojtcyjlx` and return its single JSON result. This is read-only: installed policies/functions/triggers, assignment column presence, shop identity/role counts, unresolved legacy assignment counts and private bucket status. It does not include customer notes or photo bytes.

Review the result before replacing the candidate with an approved migration. Confirm QA shop IDs, existing function signatures, permissive policy interactions, assignment labels and any ambiguous legacy references. Do not modify Del-Mobile or PFleet tester business records. Decide whether a QA-scoped staged rollout is required before global Shop role behavior changes.

## Release gates

- Keep this PR draft until installed Live state is verified and the migration/backfill scope is concrete.
- Test the finalized migration against a disposable representative schema, including inactive users, primary/additional assignment, removed assignment, child/media access, UUID cross-shop denial and owner/writer operations.
- Apply approved SQL before frontend deployment; code expects the assignment columns and floor RPC.
- Do not run rollback-only Test fixture scripts against Live.
- After deployment, verify Live QA owner -> assigned Tech -> removed Tech -> other QA shop. Use only synthetic QA records.
- Previously issued signed links remain usable until expiry; judge revocation with new authorized requests after a refresh.

## Validation so far

Frontend syntax and floor interface tests run locally. The candidate preserves the already-tested SQL implementation, but its compatibility with installed Live policies is unverified. The Live cache client from PR #86 remains intact. No Live database was queried or changed by this preparation.
