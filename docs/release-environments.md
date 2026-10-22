# Long Shift release environments

## Current state

- `master` publishes the live GitHub Pages application. Confirm the Pages source in repository Settings before changing its deployment rule.
- `js/supabase-client.js` currently hardcodes the existing Shop/PFleet Supabase project. Opening a feature branch locally does **not** isolate database writes.
- Snow QA has its own disposable Supabase project; it is not a Shop staging database.
- The SQL files under `supabase/` are installation scripts, not an ordered migration ledger. Never replay every script against a populated project.

## Target topology

| Stage | Code | Database/Auth/Storage | Data | Gate |
| --- | --- | --- | --- | --- |
| Dev | Feature branch, local server | Separate disposable development project | Synthetic fixtures only | Local review and automated static checks |
| Test | Dedicated test deployment URL and release candidate | Separate persistent Shop staging project | Synthetic shops, roles, invoices, documents | Signed-in role, RLS, storage, workflow and device QA |
| Live | Published release | Existing production project | Real Shop and PFleet accounts | Approved release and verified rollback plan |

Use distinct origins for Test and Live to keep browser auth storage and sessions apart. Use exact redirect URLs and Site URL for each Supabase project. Never use production keys in the Test build or production customer exports as test fixtures. A publishable key may be public; a service-role key must remain server-side.

## Promotion steps

1. Develop against synthetic records in Dev. Run the PR static check and review the SQL diff.
2. Inventory production's already-applied schema before establishing an ordered migration baseline. Apply only *new* migrations to the separate Test project, then exercise active/inactive owner, writer, tech and cross-shop roles.
3. Deploy the same candidate code to the Test URL with the Test project's URL and publishable key. Verify the visible environment marker and project ID before any write test.
4. Run backup/restore against a Test shop only. Verify Auth redirects, private storage policies, browser session separation, and mobile/desktop flows.
5. Record the candidate commit SHA, migrations applied, QA results, and rollback steps. Approve a live release only after the Test pass. Apply the production migrations in order and deploy that same commit.
6. Smoke-test live using a dedicated pilot account without modifying Del-Mobile or PFleet tester records. If the release fails, roll back application code; database changes need their own reviewed recovery script or forward fix.

## Required setup before live workflow changes

- Create a dedicated Shop Test Supabase project and a separate Test URL. Do not reuse the Snow QA project.
- Configure Test Auth redirect allowlist and SMTP independently; use synthetic tester accounts.
- Introduce an environment-specific client configuration at build/deploy time, with a visible Test label. Fail closed if a Test page resolves to the production project.
- Turn the current SQL installation scripts into a documented baseline and versioned forward migrations before automating database releases.
- Decouple `master` merge from live publish by configuring a deliberate release workflow or release branch, then verify the GitHub Pages source. Until then, merging a PR may be a live application deploy.

## Open PR gates

- #74: manufacturer handoffs and VIN suggestions; test against synthetic units.
- #75: draft; install the additive SQL in Test and prove assigned tech, unassigned tech, inactive member, writer and other-shop behavior before merge.
- #76: draft; desktop scan-to-file and mobile camera tests in Test, including Team Document access and OCR review.
