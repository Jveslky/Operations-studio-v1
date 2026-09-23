begin;

create table if not exists public.shop_repair_orders (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    ro_number bigint,
    legacy_local_id text,
    customer_id text,
    unit_id text,
    customer_name text not null default '',
    unit_name text not null default '',
    status text not null default 'Open',
    priority text not null default 'Normal',
    technician text not null default 'Unassigned',
    additional_technician text not null default '',
    complaint text not null default '',
    parts_needed text not null default '',
    customer_notes text not null default '',
    technician_notes text not null default '',
    additional_work_performed text not null default '',
    labor_hours numeric(10,2) not null default 0,
    estimate_labor_hours numeric(10,2) not null default 0,
    estimate_labor_rate numeric(12,2) not null default 0,
    estimate_parts_total numeric(12,2) not null default 0,
    estimate_other_charges numeric(12,2) not null default 0,
    estimate_shop_supplies numeric(12,2) not null default 0,
    estimate_shop_supplies_taxable boolean not null default false,
    estimate_environmental_fee numeric(12,2) not null default 0,
    estimate_environmental_fee_taxable boolean not null default false,
    estimate_misc_fee_label text not null default '',
    estimate_misc_fee_taxable boolean not null default false,
    estimate_discount numeric(12,2) not null default 0,
    estimate_total numeric(12,2) not null default 0,
    estimate_approval_status text not null default 'Draft',
    estimate_notes text not null default '',
    archived boolean not null default false,
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (shop_id, ro_number),
    unique (shop_id, legacy_local_id)
);

create index if not exists shop_repair_orders_shop_status_idx
on public.shop_repair_orders (shop_id, archived, status, updated_at desc);

create index if not exists shop_repair_orders_customer_idx
on public.shop_repair_orders (shop_id, customer_id, updated_at desc);

create or replace function public.assign_shop_repair_order_number()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.ro_number is null then
        perform pg_advisory_xact_lock(hashtextextended(new.shop_id::text, 0));

        select greatest(coalesce(max(ro_number), 1000) + 1, 1001)
        into new.ro_number
        from public.shop_repair_orders
        where shop_id = new.shop_id;
    end if;

    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists assign_shop_repair_order_number on public.shop_repair_orders;
create trigger assign_shop_repair_order_number
before insert on public.shop_repair_orders
for each row execute function public.assign_shop_repair_order_number();

create or replace function public.touch_shop_repair_order()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at = now();
    new.shop_id = old.shop_id;
    new.ro_number = old.ro_number;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    return new;
end;
$$;

drop trigger if exists touch_shop_repair_order on public.shop_repair_orders;
create trigger touch_shop_repair_order
before update on public.shop_repair_orders
for each row execute function public.touch_shop_repair_order();

alter table public.shop_repair_orders enable row level security;

drop policy if exists "shop members view repair orders" on public.shop_repair_orders;
create policy "shop members view repair orders"
on public.shop_repair_orders for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "office creates repair orders" on public.shop_repair_orders;
create policy "office creates repair orders"
on public.shop_repair_orders for insert to authenticated
with check (
    created_by = auth.uid()
    and public.has_shop_role(shop_id, array['owner','admin','service_writer'])
);

drop policy if exists "office updates repair orders" on public.shop_repair_orders;
create policy "office updates repair orders"
on public.shop_repair_orders for update to authenticated
using (public.has_shop_role(shop_id, array['owner','admin','service_writer']))
with check (public.has_shop_role(shop_id, array['owner','admin','service_writer']));

drop policy if exists "owners delete repair orders" on public.shop_repair_orders;
create policy "owners delete repair orders"
on public.shop_repair_orders for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','admin']));

create or replace function public.update_shop_repair_order_work(
    target_id uuid,
    new_status text,
    new_technician_notes text,
    new_labor_hours numeric,
    new_additional_work text
)
returns public.shop_repair_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.shop_repair_orders;
begin
    select * into target
    from public.shop_repair_orders
    where id = target_id;

    if target.id is null or not public.has_shop_role(
        target.shop_id,
        array['owner','admin','service_writer','technician']
    ) then
        raise exception 'Repair order is unavailable.';
    end if;

    update public.shop_repair_orders
    set status = coalesce(new_status, status),
        technician_notes = coalesce(new_technician_notes, technician_notes),
        labor_hours = greatest(coalesce(new_labor_hours, labor_hours), 0),
        additional_work_performed = coalesce(new_additional_work, additional_work_performed)
    where id = target_id
    returning * into target;

    return target;
end;
$$;

revoke all on function public.update_shop_repair_order_work(uuid,text,text,numeric,text) from public;
grant execute on function public.update_shop_repair_order_work(uuid,text,text,numeric,text) to authenticated;

grant select, insert, update, delete on public.shop_repair_orders to authenticated;

commit;
