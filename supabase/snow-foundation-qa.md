# Snow foundation rollout and isolation QA

`snow-foundation.sql` is a one-time migration **for review**. It was applied on September 27, 2026 only to the disposable **Long Shift Snow QA** project (`yugxugsysvciscegavvv`); the shared project was not changed. It creates Snow-only tables, RLS policies, and server functions. It neither reads nor writes Shop, Del-Mobile, Mobile, or PFleet data. No browser-local Snow jobs are imported.

## Before applying anywhere shared

1. Applied in the empty Snow QA project; syntax succeeded. Have a second reviewer inspect the `SECURITY DEFINER` functions, tenant foreign keys, grants, and policies before applying in any shared project. This workspace has no local Postgres instance.
2. Create two independent authenticated accounts and Snow workspaces using `snow_create_workspace`. Create a dispatcher, operator, and inactive member in workspace A; create another owner in workspace B. Use separate sessions/JWTs for each identity; never rely on a single browser's cached Supabase session.
3. Under the actual `authenticated` role and user JWT, verify A cannot select or insert B's customer, property, route, service, quote, or log. Try a guessed B property ID with A's workspace ID and expect the composite FK to reject it. Reverse A/B and repeat.
4. Verify an operator sees only assigned events and their corresponding property, customer, route, quote, and log. An unassigned or inactive operator sees none. Direct UPDATE on events and quotes, and all writes to event log, must fail.
5. Test `snow_record_service`: assigned operator may record a status and material; unassigned operator cannot. Completion timestamps come from the server. Only owner/dispatcher may reopen completed work before billing. No one may reopen after ready-to-bill.
6. Test quote versions: office users create Draft rows; `snow_agree_quote` records actor/time and supersedes the prior agreed version. Operators cannot agree quotes. Marking ready to bill requires Completed plus an Agreed quote. Quotes cannot change after ready-to-bill.
7. Test workspace owner changes: two owners can be added; the last active owner cannot be demoted or deactivated, including concurrent attempts. No client can change workspace IDs, actor IDs, creation times, or another user's membership via direct table writes.
8. Confirm the audit table has an entry for each service or quote insert/update and no authenticated session can alter earlier entries. Validate a backup and same-workspace restore design before treating this as a permanent service record.

## Disposable-project result

The transactional test in `snow-foundation-isolation.test.sql` ran successfully in Snow QA on September 27, 2026, including a same-workspace unassigned stop and dispatcher assignment. All eight Snow tables had RLS enabled; there were zero Shop tables. Post-test counts were zero auth users, workspaces, service events, and audit rows, confirming the synthetic fixtures rolled back. Browser-based sign-in/API tests and backup/restore remain open gates.

## Integration gate

Only after these checks pass should the Snow UI swap `snowDeskDraft.v1` for authenticated reads and writes. Keep local demo drafts separate: show a preview and explicit import into the selected Snow workspace rather than silently copying localStorage. Private photo policies, customer messaging, invoice integration, and storage quotas need their own migrations and tests.
