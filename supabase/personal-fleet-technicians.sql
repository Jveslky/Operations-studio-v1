-- Track Right Personal Fleet technician roster
-- Run once in the Supabase SQL editor. Safe to run more than once.

create table if not exists public.personal_fleet_technicians (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.personal_fleet_accounts(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 120),
    email text,
    phone text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists personal_fleet_technicians_account_idx
on public.personal_fleet_technicians (account_id, is_active, name);

create or replace function public.is_personal_fleet_manager(requested_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.personal_fleet_members members
        join public.personal_fleet_accounts accounts on accounts.id = members.account_id
        where members.account_id = requested_account_id
          and members.user_id = auth.uid()
          and members.is_active = true
          and members.role in ('owner', 'manager')
          and accounts.status = 'active'
    );
$$;

alter table public.personal_fleet_technicians enable row level security;

drop policy if exists "members read personal fleet technicians" on public.personal_fleet_technicians;
create policy "members read personal fleet technicians" on public.personal_fleet_technicians
for select to authenticated using (public.is_personal_fleet_member(account_id));

drop policy if exists "managers create personal fleet technicians" on public.personal_fleet_technicians;
create policy "managers create personal fleet technicians" on public.personal_fleet_technicians
for insert to authenticated with check (public.is_personal_fleet_manager(account_id));

drop policy if exists "managers update personal fleet technicians" on public.personal_fleet_technicians;
create policy "managers update personal fleet technicians" on public.personal_fleet_technicians
for update to authenticated using (public.is_personal_fleet_manager(account_id))
with check (public.is_personal_fleet_manager(account_id));

drop policy if exists "managers delete personal fleet technicians" on public.personal_fleet_technicians;
create policy "managers delete personal fleet technicians" on public.personal_fleet_technicians
for delete to authenticated using (public.is_personal_fleet_manager(account_id));

revoke all on function public.is_personal_fleet_manager(uuid) from public;
grant execute on function public.is_personal_fleet_manager(uuid) to authenticated;
grant select, insert, update, delete on public.personal_fleet_technicians to authenticated;
