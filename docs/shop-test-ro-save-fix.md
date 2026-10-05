# Shop Test RO creation policy correction

Observed: creating an RO returns `new row violates row-level security policy "assigned ro read boundary"`. Reproduced with PostgreSQL INSERT RETURNING as authenticated Owner.

Cause: the SELECT boundary uses a STABLE helper that queries the RO table. The new row is not visible in that statement snapshot when RETURNING checks SELECT RLS. Replace only that boundary with a direct new-row assignment check plus existing active-membership/read permission checks. Leave lookup-based helpers for existing RO children/media untouched.

Run supabase/shop-test-ro-insert-read-policy-fix.sql in project guvzuufdmnvurshknsnq only. The script verifies the exact two Test shop IDs and rejects other shops. No records are changed. Then retry creation using the existing selected customer and vehicle, avoiding duplicate intake records.

Local PostgreSQL regression reproduces the old failure and passes corrected Owner/Writer INSERT RETURNING, assigned/unassigned variants, cross-shop insert denial, Tech assignment reads and creation denial, repeat installation and zero retained fixtures. Existing role and interface suites pass. Supabase installation and signed-in retry remain pending.
