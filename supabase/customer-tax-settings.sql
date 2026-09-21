-- Run after shop-profile-settings.sql.
-- Adds shop tax defaults, protected customer tax profiles, private exemption
-- certificates, and authoritative invoice tax snapshots. No existing rows are deleted.

alter table public.shops
    add column if not exists default_taxable boolean not null default false,
    add column if not exists default_tax_rate numeric(6, 3) not null default 0;

alter table public.shops
    drop constraint if exists shops_default_tax_rate_range;
alter table public.shops
    add constraint shops_default_tax_rate_range
    check (default_tax_rate >= 0 and default_tax_rate <= 100);

grant update (default_taxable, default_tax_rate, updated_at)
on public.shops to authenticated;

create table if not exists public.customer_tax_profiles (
    shop_id uuid not null references public.shops(id) on delete cascade,
    customer_id text primary key,
    tax_status text not null default 'inherit'
        check (tax_status in ('inherit', 'taxable', 'exempt')),
    exemption_reason text,
    exemption_certificate_number text,
    exemption_certificate_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.validate_customer_tax_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public."Customers" customers
        where customers.id::text = new.customer_id
          and customers.shop_id = new.shop_id
    ) then
        raise exception 'Customer does not belong to this shop';
    end if;
    return new;
end;
$$;

drop trigger if exists validate_customer_tax_profile_shop on public.customer_tax_profiles;
create trigger validate_customer_tax_profile_shop
before insert or update on public.customer_tax_profiles
for each row execute function public.validate_customer_tax_profile();

alter table public.customer_tax_profiles enable row level security;

drop policy if exists "members view customer tax profiles" on public.customer_tax_profiles;
create policy "members view customer tax profiles"
on public.customer_tax_profiles for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "owners and admins manage customer tax profiles" on public.customer_tax_profiles;
create policy "owners and admins manage customer tax profiles"
on public.customer_tax_profiles for all to authenticated
using (public.has_shop_role(shop_id, array['owner', 'admin']))
with check (public.has_shop_role(shop_id, array['owner', 'admin']));

grant select, insert, update, delete on public.customer_tax_profiles to authenticated;

create table if not exists public.shop_invoice_tax_snapshots (
    shop_id uuid not null references public.shops(id) on delete cascade,
    invoice_id text not null,
    customer_id text,
    taxable boolean not null,
    tax_rate numeric(6, 3) not null,
    subtotal numeric(14, 2) not null,
    tax_amount numeric(14, 2) not null,
    total numeric(14, 2) not null,
    customer_tax_status text not null,
    exemption_reason text,
    exemption_certificate_number text,
    captured_at timestamptz not null default now(),
    primary key (shop_id, invoice_id)
);

alter table public.shop_invoice_tax_snapshots enable row level security;

drop policy if exists "members view invoice tax snapshots" on public.shop_invoice_tax_snapshots;
create policy "members view invoice tax snapshots"
on public.shop_invoice_tax_snapshots for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "invoice writers create tax snapshots" on public.shop_invoice_tax_snapshots;
create policy "invoice writers create tax snapshots"
on public.shop_invoice_tax_snapshots for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer']));

grant select, insert on public.shop_invoice_tax_snapshots to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'customer-tax-certificates',
    'customer-tax-certificates',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop members view tax certificates" on storage.objects;
create policy "shop members view tax certificates"
on storage.objects for select to authenticated
using (
    bucket_id = 'customer-tax-certificates'
    and public.is_shop_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "owners and admins upload tax certificates" on storage.objects;
create policy "owners and admins upload tax certificates"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'customer-tax-certificates'
    and public.has_shop_role((storage.foldername(name))[1]::uuid, array['owner', 'admin'])
);

drop policy if exists "owners and admins delete tax certificates" on storage.objects;
create policy "owners and admins delete tax certificates"
on storage.objects for delete to authenticated
using (
    bucket_id = 'customer-tax-certificates'
    and public.has_shop_role((storage.foldername(name))[1]::uuid, array['owner', 'admin'])
);
