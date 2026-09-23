-- Persistent, shop-scoped appointments for the Shop Schedule workspace.

create table if not exists public.shop_appointments (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    customer text not null check (char_length(trim(customer)) between 1 and 200),
    unit text check (char_length(unit) <= 300),
    scheduled_on date not null,
    start_time time not null,
    end_time time,
    technician text check (char_length(technician) <= 200),
    appointment_type text not null default 'Shop'
        check (appointment_type in ('Shop','Mobile','Dropoff','Pickup','Other')),
    status text not null default 'Scheduled'
        check (status in ('Scheduled','Confirmed','In Progress','Completed','Cancelled')),
    location text check (char_length(location) <= 500),
    description text check (char_length(description) <= 4000),
    created_by uuid not null references auth.users(id) on delete restrict,
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_time is null or end_time >= start_time)
);

create index if not exists shop_appointments_shop_date_idx
    on public.shop_appointments(shop_id,scheduled_on,start_time);
create index if not exists shop_appointments_shop_status_idx
    on public.shop_appointments(shop_id,status,scheduled_on);

alter table public.shop_appointments enable row level security;

drop policy if exists "shop members view appointments" on public.shop_appointments;
create policy "shop members view appointments" on public.shop_appointments
for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists "schedule managers create appointments" on public.shop_appointments;
create policy "schedule managers create appointments" on public.shop_appointments
for insert to authenticated with check (
    created_by=auth.uid() and updated_by=auth.uid()
    and public.has_shop_role(shop_id,array['owner','admin','service_writer'])
);

drop policy if exists "schedule managers update appointments" on public.shop_appointments;
create policy "schedule managers update appointments" on public.shop_appointments
for update to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']))
with check (updated_by=auth.uid() and public.has_shop_role(shop_id,array['owner','admin','service_writer']));

drop policy if exists "schedule managers delete appointments" on public.shop_appointments;
create policy "schedule managers delete appointments" on public.shop_appointments
for delete to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']));

revoke update on public.shop_appointments from authenticated;
grant select,insert,delete on public.shop_appointments to authenticated;
grant update(customer,unit,scheduled_on,start_time,end_time,technician,appointment_type,status,location,description,updated_by,updated_at)
on public.shop_appointments to authenticated;

create or replace function public.list_shop_schedule_members()
returns table(user_id uuid,email text,role text)
language sql stable security definer set search_path=public as $$
    select members.user_id,users.email::text,members.role
    from public.shop_members members
    join auth.users users on users.id=members.user_id
    where members.shop_id in (
        select mine.shop_id from public.shop_members mine
        where mine.user_id=auth.uid() and mine.is_active=true
    )
      and members.is_active=true
      and members.role in ('owner','admin','service_writer','technician')
    order by users.email;
$$;

revoke all on function public.list_shop_schedule_members() from public;
grant execute on function public.list_shop_schedule_members() to authenticated;
