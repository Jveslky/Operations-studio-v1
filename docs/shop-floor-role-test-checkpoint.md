# Shop floor roles — Test checkpoint

Target: `shop-test`, Cloudflare `long-shift-test.pages.dev`, Supabase **guvzuufdmnvurshknsnq**.
Feature: `test/shop-floor-role-access`. This branch inherits the Test client; never merge it into Live/master.

## Behavior

| Role | Default scope |
| --- | --- |
| Technician | Primary/additional assigned ROs; work fields and inspections/photos; assigned schedule; own requests/shared credentials |
| Foreman | All same-shop ROs; delegate primary/additional technicians, priority and work; inspections/photos; shop schedule read; own requests/shared credentials |
| Service writer | Office/customer/schedule/estimate/invoice workflow; can assign work; peer to Foreman |
| Shop admin | Shop and office oversight; existing full admin preset retained |
| Owner | Full shop authority; owner account protected |

ROs include customer/unit names and estimate information. Assignment scoping does not hide portions of an assigned RO. Foreman has no default invoice/AP/private-documents/user/settings/export/restore authority. Existing optional permission overrides remain available; broadening floor navigation for those overrides is outside this checkpoint.

## Rollout order

1. Verify SQL Editor project URL contains **guvzuufdmnvurshknsnq**. Stop if it is Live **amikoqrqutnpojtcyjlx** or Snow **yugxugsysvciscegavvv**.
2. Run `supabase/shop-test-floor-role-access.sql`. Its guard requires exactly the verified Test A ID `ddd8d44c-041f-4510-aa8b-a03b2dde87a6` and Test B ID `1161bc88-9ed5-4d76-a2cf-c7a77d41eea9`, with no other shops. Display names do not determine the guard. Resolve any rows returned by the final unresolved-assignment query before tech tests. No data is deleted; assignment backfill updates RO timestamps. Legacy non-email assignment labels fail closed until an office user reassigns them with the active-member picker. Assignment foreign keys require unassigning an Auth user before deleting that user; disabling their membership preserves service history and revokes access.
3. Run `supabase/shop-test-floor-role-checks.sql`. Paste and run the entire file in a fresh SQL Editor tab with no partial text selection; the checks run in one anonymous SQL block and require no temporary tables. The block forces an internal rollback after all assertions pass, then verifies fixtures and original memberships were restored. Every assertion must pass; final statement reports rollback complete. It temporarily uses the existing Writer as Foreman, restores roles through rollback, and creates no retained users or service records.
4. Merge the feature into **shop-test** after those database checks pass. The UI needs the migration first. No Live deployment is included.
5. Use a dedicated synthetic Foreman account (or temporarily change the Test Writer with Owner) for browser testing. Keep a Writer account available to verify its separate scope.

## Verification status

Passed locally using PostgreSQL in PGlite, with stubbed Supabase Auth/Storage schemas and the repository's baseline migrations:

- Primary/additional tech visibility; unassigned and cross-shop reads blocked.
- Assigned work RPC succeeds; unassigned work/assignment RPC fails; direct tech assignment/estimate updates affect zero rows.
- Assigned inspections attach; forbidden inspection references rejected.
- Assigned photo metadata upload/read allowed; unassigned upload denied by actual storage RLS.
- Reassignment revokes RO/inspection/photo reads; inactive membership reads no ROs.
- Foreman reads all same-shop ROs and saves assignment/priority/work atomically without editing estimate totals.
- Foreman default permissions exclude finance/settings/users.
- Migration reruns; rollback leaves zero RO fixtures; UI and SQL role presets agree.
- Extensionless/HTML routes retain Dashboard; forbidden floor pages redirect; save requests use narrow RPCs and omit estimate/customer fields.

**Not yet verified in Supabase or signed-in browsers.** SQL installation, real Storage API behavior, signed URLs, backup/restore, and account refresh/login are still gates. PGlite tests do not reproduce Supabase's HTTP/storage service or auth lifecycle.

## Signed-in gate

- Tech: assigned primary + additional visible on dashboard/board; another tech/unassigned/copied UUID/numeric URL unavailable; notes survive reload/login.
- Foreman: all Test A ROs visible; assignment + priority save and persist; tech immediately gains/loses work on refresh after assignment changes. Estimates/customer fields disabled; invoice/AP/settings/private team docs unavailable.
- Writer: customers, scheduling, estimates, invoices and assignments remain usable. Admin/Owner: oversight + users/role invitation UI work; Foreman invitation accepted correctly.
- Test B: Test A RO/inspection/photo identifiers unavailable in UI **and signed-in API calls**, in both directions.
- Photo API: assigned upload/metadata/download succeeds; unassigned, other-shop, malformed and moved-scope paths denied; removal/inactivation prevents fresh signed URLs. Already issued signed URLs can remain valid until expiry; use short lifetimes.
- Backup: Owner export/same-shop missing-only restore still works with new assignment UUID columns; different-shop restore rejected. Foreman/Tech export/restore denied by default. Use disposable Test records only.
- Review table/function grants in deployed `pg_policies`/catalog output; migrations are additive restrictive boundaries and explicitly narrow definer RPCs, not hidden-nav security.

Pending mileage/VIN/scanner PRs must be reviewed against this assignment gate before Test promotion. Do not touch Del-Mobile, PFleet tester, original Shop QA, or Snow QA data.

## Local reproduction

`npm install --prefix tests` then `npm test --prefix tests`.
The database test creates only an in-memory database; it has no credentials, Supabase connection, or persistent files. Auth/Storage are minimal test stubs. For real deployment use the SQL Editor checks above.
