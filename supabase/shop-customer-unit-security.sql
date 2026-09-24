begin;

-- Canonical tenant policies for the two legacy-named Shop tables. These are
-- safe to rerun and ensure isolation does not depend on client-side filters.
alter table public."Customers" enable row level security;
alter table public.customer_units enable row level security;

-- Earlier membership-only policies are permissive OR policies. Leaving them
-- in place bypasses role checks and lets inactive members see these records.
drop policy if exists "Insert own customers" on public."Customers";
drop policy if exists "Select own customers" on public."Customers";
drop policy if exists "Members can update shop customers" on public."Customers";
drop policy if exists "Members can add customer units" on public.customer_units;
drop policy if exists "Members can view customer units" on public.customer_units;
drop policy if exists "Members can update customer units" on public.customer_units;

drop policy if exists "shop members view customers" on public."Customers";
create policy "shop members view customers" on public."Customers"
for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists "office creates customers" on public."Customers";
create policy "office creates customers" on public."Customers"
for insert to authenticated
with check (public.has_shop_role(shop_id,array['owner','admin','service_writer']));

drop policy if exists "office updates customers" on public."Customers";
create policy "office updates customers" on public."Customers"
for update to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']))
with check (public.has_shop_role(shop_id,array['owner','admin','service_writer']));

drop policy if exists "owners delete customers" on public."Customers";
create policy "owners delete customers" on public."Customers"
for delete to authenticated
using (public.has_shop_role(shop_id,array['owner','admin']));

drop policy if exists "shop members view customer units" on public.customer_units;
create policy "shop members view customer units" on public.customer_units
for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists "office creates customer units" on public.customer_units;
create policy "office creates customer units" on public.customer_units
for insert to authenticated
with check (
    public.has_shop_role(shop_id,array['owner','admin','service_writer'])
    and exists (
        select 1 from public."Customers" customers
        where customers.id=customer_units.customer_id
          and customers.shop_id=customer_units.shop_id
    )
);

drop policy if exists "office updates customer units" on public.customer_units;
create policy "office updates customer units" on public.customer_units
for update to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']))
with check (
    public.has_shop_role(shop_id,array['owner','admin','service_writer'])
    and exists (
        select 1 from public."Customers" customers
        where customers.id=customer_units.customer_id
          and customers.shop_id=customer_units.shop_id
    )
);

drop policy if exists "owners delete customer units" on public.customer_units;
create policy "owners delete customer units" on public.customer_units
for delete to authenticated
using (public.has_shop_role(shop_id,array['owner','admin']));

grant select,insert,update,delete on public."Customers" to authenticated;
grant select,insert,update,delete on public.customer_units to authenticated;

commit;
