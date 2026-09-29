begin;

-- Run after Shop repair orders and technician workspace access are installed.
alter table public.customer_units add column if not exists mileage numeric(12,1);

create table if not exists public.shop_unit_identity_edits (
    id bigint generated always as identity primary key,
    shop_id uuid not null references public.shops(id) on delete cascade,
    unit_id text not null,
    repair_order_id uuid not null references public.shop_repair_orders(id) on delete cascade,
    changed_by uuid not null references auth.users(id),
    old_serial text,
    new_serial text,
    old_mileage numeric(12,1),
    new_mileage numeric(12,1),
    changed_at timestamptz not null default now()
);
create index if not exists shop_unit_identity_edits_shop_unit_idx
    on public.shop_unit_identity_edits (shop_id, unit_id, changed_at desc);
alter table public.shop_unit_identity_edits enable row level security;
drop policy if exists "office views unit identity edits" on public.shop_unit_identity_edits;
create policy "office views unit identity edits" on public.shop_unit_identity_edits
    for select to authenticated using (public.shop_has_permission(shop_id, 'customers.read'));
revoke all on public.shop_unit_identity_edits from public, anon, authenticated;
grant select on public.shop_unit_identity_edits to authenticated;

create or replace function public.tech_assigned_unit(target_ro uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target public.shop_repair_orders%rowtype;
    unit_record public.customer_units%rowtype;
    tech_email text;
begin
    select * into target from public.shop_repair_orders where id=target_ro;
    select lower(email) into tech_email from auth.users where id=auth.uid();
    if target.id is null or target.unit_id is null or not exists (
        select 1 from public.shop_members m
        where m.shop_id=target.shop_id and m.user_id=auth.uid()
          and m.is_active and m.role='technician'
    ) or target.archived or not coalesce(
        lower(target.technician)=tech_email or lower(target.additional_technician)=tech_email, false
    ) then raise exception 'Assigned unit is unavailable'; end if;
    select * into unit_record from public.customer_units
        where id::text=target.unit_id and shop_id=target.shop_id and archived=false;
    if unit_record.id is null then raise exception 'Assigned unit is unavailable'; end if;
    return jsonb_build_object('serial',unit_record.serial,'mileage',unit_record.mileage,
        'unit',target.unit_name,'ro',target.ro_number);
end;
$$;

create or replace function public.tech_update_assigned_unit(
    target_ro uuid, new_serial text, new_mileage numeric,
    expected_serial text, expected_mileage numeric
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target public.shop_repair_orders%rowtype;
    unit_record public.customer_units%rowtype;
    tech_email text;
    cleaned_serial text := upper(btrim(coalesce(new_serial,'')));
begin
    if length(cleaned_serial)>100 or new_mileage<0 or new_mileage>999999999.9 then
        raise exception 'Check the serial and mileage values';
    end if;
    select * into target from public.shop_repair_orders where id=target_ro;
    select lower(email) into tech_email from auth.users where id=auth.uid();
    if target.id is null or target.unit_id is null or not exists (
        select 1 from public.shop_members m
        where m.shop_id=target.shop_id and m.user_id=auth.uid()
          and m.is_active and m.role='technician'
    ) or target.archived or not coalesce(
        lower(target.technician)=tech_email or lower(target.additional_technician)=tech_email, false
    ) then raise exception 'Assigned unit is unavailable'; end if;
    select * into unit_record from public.customer_units
        where id::text=target.unit_id and shop_id=target.shop_id and archived=false for update;
    if unit_record.id is null then raise exception 'Assigned unit is unavailable'; end if;
    if unit_record.serial is distinct from expected_serial
       or unit_record.mileage is distinct from expected_mileage then
        raise exception 'Unit details changed. Reload before saving';
    end if;
    if unit_record.serial is distinct from cleaned_serial
       or unit_record.mileage is distinct from new_mileage then
        update public.customer_units set serial=cleaned_serial,mileage=new_mileage,updated_at=now()
            where id=unit_record.id and shop_id=target.shop_id;
        insert into public.shop_unit_identity_edits
            (shop_id,unit_id,repair_order_id,changed_by,old_serial,new_serial,old_mileage,new_mileage)
        values (target.shop_id,target.unit_id,target.id,auth.uid(),unit_record.serial,cleaned_serial,
            unit_record.mileage,new_mileage);
    end if;
    return jsonb_build_object('serial',cleaned_serial,'mileage',new_mileage);
end;
$$;

revoke all on function public.tech_assigned_unit(uuid) from public, anon;
revoke all on function public.tech_update_assigned_unit(uuid,text,numeric,text,numeric) from public, anon;
grant execute on function public.tech_assigned_unit(uuid) to authenticated;
grant execute on function public.tech_update_assigned_unit(uuid,text,numeric,text,numeric) to authenticated;

commit;
