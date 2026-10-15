# Shop setup clarity — PR99

## Reviewed paths

- Shop Profile loads and saves the current `shops` record with explicit shop ID scoping. Only owner/admin can edit; existing database enforcement is unchanged.
- Labor rate remains an optional nonnegative numeric field; zero is valid. This pass does not redefine pricing behavior.
- Timezone selection is a suggestion until Save Shop Profile succeeds. An unset shop uses UTC for billing day calculations. Changing the selection shows both the pending choice and the saved timezone; returning to the saved choice clears the warning. Save errors leave the pending warning intact.
- Tax defaults have a separate save action and existing owner/admin enforcement. The setup guide links directly to that section and explains percentage entry. No tax jurisdiction is inferred.
- Users & Permissions creates a role-specific invitation link. The owner shares that generated link; the guide does not imply email is sent automatically.

## Manual checks still required

1. In Test, open an owner/admin shop without a saved timezone: confirm the amber Not saved message. Select a zone and save; refresh and verify Saved shop timezone. In a configured shop, change the selector without saving, then revert it. Confirm the warning follows the saved state.
2. Follow Shop tax defaults from the guide. Verify the correct section opens and saving tax remains separate from saving the profile. Use synthetic rates only in Test.
3. Follow Users & Permissions. In an isolated fresh Test shop, create and accept one staff invitation, confirm the intended role and shop, and verify unauthorized settings access is denied. Creating and sending invitations is a manual QA action, not performed by this implementation pass.
4. Complete a first synthetic RO/invoice after setup and confirm labor rate, applicable tax and local due date. Previously issued invoices must retain their captured values.

The code review and automated regressions do not replace a fresh-shop signed-in setup run. No SQL migration is required for PR99.
