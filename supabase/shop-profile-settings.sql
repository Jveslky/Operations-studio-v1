-- Run once in the Supabase SQL editor before using Shop Profile settings.
-- This migration is additive: it does not delete or rewrite existing Shop data.

alter table public.shops
    add column if not exists business_email text,
    add column if not exists business_phone text,
    add column if not exists website text,
    add column if not exists address_line_1 text,
    add column if not exists address_line_2 text,
    add column if not exists city text,
    add column if not exists region text,
    add column if not exists postal_code text,
    add column if not exists country text,
    add column if not exists default_labor_rate numeric(12, 2),
    add column if not exists timezone text,
    add column if not exists updated_at timestamptz not null default now();

alter table public.shops
    drop constraint if exists shops_default_labor_rate_nonnegative;

alter table public.shops
    add constraint shops_default_labor_rate_nonnegative
    check (default_labor_rate is null or default_labor_rate >= 0);

drop policy if exists "owners and admins update shop profile" on public.shops;
create policy "owners and admins update shop profile"
on public.shops
for update
to authenticated
using (
    public.has_shop_role(id, array['owner', 'admin'])
)
with check (
    public.has_shop_role(id, array['owner', 'admin'])
);

grant select on public.shops to authenticated;
grant update (
    name,
    business_email,
    business_phone,
    website,
    address_line_1,
    address_line_2,
    city,
    region,
    postal_code,
    country,
    default_labor_rate,
    timezone,
    updated_at
) on public.shops to authenticated;
