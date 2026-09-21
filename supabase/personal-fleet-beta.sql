-- Track Right Personal Fleet beta
-- Run after auth-and-membership.sql in the Supabase SQL editor.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.platform_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('platform_owner', 'platform_admin')),
    created_at timestamptz not null default now()
);

-- Preserve access for the existing project owner during the first migration.
-- This only auto-promotes when there is exactly one verified shop creator/owner.
with owner_candidates as (
    select distinct members.user_id
    from public.shop_members members
    join public.shops shops
      on shops.id = members.shop_id
     and shops.created_by = members.user_id
    where members.role = 'owner' and members.is_active = true
), single_owner as (
    select min(user_id::text)::uuid as user_id
    from owner_candidates
    having count(*) = 1
)
insert into public.platform_users (user_id, role)
select user_id, 'platform_owner' from single_owner
on conflict (user_id) do nothing;

create table if not exists public.personal_fleet_accounts (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 2 and 120),
    plan_code text not null default 'beta_full',
    billing_status text not null default 'complimentary'
        check (billing_status in ('complimentary', 'trial', 'active', 'past_due', 'cancelled')),
    unit_limit integer not null default 20 check (unit_limit between 1 and 10000),
    features text[] not null default array['tracker', 'repair_orders']::text[],
    status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.personal_fleet_members (
    account_id uuid not null references public.personal_fleet_accounts(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner' check (role in ('owner', 'manager', 'viewer')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (account_id, user_id)
);

create table if not exists public.personal_fleet_invitations (
    id uuid primary key default gen_random_uuid(),
    token uuid not null unique default gen_random_uuid(),
    email text not null,
    account_name text not null check (char_length(trim(account_name)) between 2 and 120),
    plan_code text not null default 'beta_full',
    billing_status text not null default 'complimentary',
    unit_limit integer not null default 20 check (unit_limit between 1 and 10000),
    features text[] not null default array['tracker', 'repair_orders']::text[],
    invited_by uuid not null references auth.users(id),
    expires_at timestamptz,
    accepted_at timestamptz,
    accepted_by uuid references auth.users(id),
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.personal_fleet_units (
    account_id uuid not null references public.personal_fleet_accounts(id) on delete cascade,
    record_id text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (account_id, record_id)
);

create table if not exists public.personal_fleet_repair_orders (
    account_id uuid not null references public.personal_fleet_accounts(id) on delete cascade,
    record_id text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (account_id, record_id)
);

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

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.platform_users
        where user_id = auth.uid()
          and role in ('platform_owner', 'platform_admin')
    );
$$;

create or replace function public.is_personal_fleet_member(requested_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.personal_fleet_members members
        join public.personal_fleet_accounts accounts on accounts.id = members.account_id
        where members.account_id = requested_account_id
          and members.user_id = auth.uid()
          and members.is_active = true
          and accounts.status = 'active'
    );
$$;

create or replace function public.is_personal_fleet_manager(requested_account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.personal_fleet_members members
        join public.personal_fleet_accounts accounts on accounts.id = members.account_id
        where members.account_id = requested_account_id and members.user_id = auth.uid()
          and members.is_active = true and members.role in ('owner', 'manager')
          and accounts.status = 'active'
    );
$$;

create or replace function public.create_personal_fleet_invitation(
    invited_email text,
    requested_account_name text,
    requested_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    new_token uuid;
begin
    if not public.is_platform_admin() then
        raise exception 'Platform administrator access required';
    end if;
    if invited_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
        raise exception 'Enter a valid email address';
    end if;
    if char_length(trim(coalesce(requested_account_name, ''))) < 2 then
        raise exception 'An account name is required';
    end if;

    update public.personal_fleet_invitations
    set revoked_at = now()
    where lower(email) = lower(trim(invited_email))
      and accepted_at is null
      and revoked_at is null;

    insert into public.personal_fleet_invitations (
        email, account_name, invited_by, expires_at
    ) values (
        lower(trim(invited_email)), trim(requested_account_name), auth.uid(), requested_expires_at
    ) returning token into new_token;

    return new_token;
end;
$$;

create or replace function public.get_personal_fleet_invitation(invitation_token uuid)
returns table (account_name text, email text, plan_code text, unit_limit integer, features text[])
language sql
stable
security definer
set search_path = public
as $$
    select invitations.account_name, invitations.email, invitations.plan_code,
           invitations.unit_limit, invitations.features
    from public.personal_fleet_invitations invitations
    where invitations.token = invitation_token
      and invitations.accepted_at is null
      and invitations.revoked_at is null
      and (invitations.expires_at is null or invitations.expires_at > now());
$$;

create or replace function public.accept_personal_fleet_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    invitation public.personal_fleet_invitations%rowtype;
    login_email text;
    new_account_id uuid;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;

    select lower(email) into login_email from auth.users where id = auth.uid();
    select * into invitation
    from public.personal_fleet_invitations
    where token = invitation_token
      and accepted_at is null
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    for update;

    if invitation.id is null then raise exception 'Invitation is invalid or no longer available'; end if;
    if login_email <> lower(invitation.email) then raise exception 'Use the email address that was invited'; end if;

    insert into public.personal_fleet_accounts (
        name, plan_code, billing_status, unit_limit, features, created_by
    ) values (
        invitation.account_name, invitation.plan_code, invitation.billing_status,
        invitation.unit_limit, invitation.features, auth.uid()
    ) returning id into new_account_id;

    insert into public.personal_fleet_members (account_id, user_id, role)
    values (new_account_id, auth.uid(), 'owner');

    update public.personal_fleet_invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where id = invitation.id;

    return new_account_id;
end;
$$;

create or replace function public.accept_personal_fleet_invitation(
    invitation_token uuid,
    requested_fleet_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    invitation public.personal_fleet_invitations%rowtype;
    login_email text;
    fleet_name text;
    new_account_id uuid;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    fleet_name := trim(coalesce(requested_fleet_name, ''));
    if char_length(fleet_name) < 2 or char_length(fleet_name) > 120 then
        raise exception 'Fleet Name must be between 2 and 120 characters';
    end if;
    select lower(email) into login_email from auth.users where id = auth.uid();
    select * into invitation from public.personal_fleet_invitations
    where token = invitation_token and accepted_at is null and revoked_at is null
      and (expires_at is null or expires_at > now()) for update;
    if invitation.id is null then raise exception 'Invitation is invalid or no longer available'; end if;
    if login_email <> lower(invitation.email) then raise exception 'Use the email address that was invited'; end if;
    insert into public.personal_fleet_accounts (
        name, plan_code, billing_status, unit_limit, features, created_by
    ) values (
        fleet_name, invitation.plan_code, invitation.billing_status,
        invitation.unit_limit, invitation.features, auth.uid()
    ) returning id into new_account_id;
    insert into public.personal_fleet_members (account_id, user_id, role)
    values (new_account_id, auth.uid(), 'owner');
    update public.personal_fleet_invitations set accepted_at = now(), accepted_by = auth.uid()
    where id = invitation.id;
    return new_account_id;
end;
$$;

create or replace function public.update_personal_fleet_name(requested_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare fleet_name text;
begin
    fleet_name := trim(coalesce(requested_name, ''));
    if char_length(fleet_name) < 2 or char_length(fleet_name) > 120 then
        raise exception 'Fleet Name must be between 2 and 120 characters';
    end if;
    update public.personal_fleet_accounts accounts
    set name = fleet_name, updated_at = now()
    where exists (
        select 1 from public.personal_fleet_members members
        where members.account_id = accounts.id and members.user_id = auth.uid()
          and members.is_active = true and members.role in ('owner', 'manager')
    );
    if not found then raise exception 'Fleet owner or manager access required'; end if;
end;
$$;

create or replace function public.list_personal_fleet_invitations()
returns table (
    id uuid, email text, account_name text, plan_code text, billing_status text,
    unit_limit integer, features text[], created_at timestamptz, expires_at timestamptz,
    accepted_at timestamptz, revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select invitations.id, invitations.email, invitations.account_name,
           invitations.plan_code, invitations.billing_status, invitations.unit_limit,
           invitations.features, invitations.created_at, invitations.expires_at,
           invitations.accepted_at, invitations.revoked_at
    from public.personal_fleet_invitations invitations
    where public.is_platform_admin()
    order by invitations.created_at desc;
$$;

create or replace function public.revoke_personal_fleet_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Platform administrator access required';
    end if;
    update public.personal_fleet_invitations
    set revoked_at = now()
    where id = invitation_id and accepted_at is null;
end;
$$;

create or replace function public.enforce_personal_fleet_unit_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    allowed_units integer;
    current_units integer;
begin
    if coalesce((new.payload->>'archived')::boolean, false) then return new; end if;
    select unit_limit into allowed_units from public.personal_fleet_accounts where id = new.account_id;
    select count(*) into current_units
    from public.personal_fleet_units
    where account_id = new.account_id
      and record_id <> new.record_id
      and not coalesce((payload->>'archived')::boolean, false);
    if current_units >= allowed_units then
        raise exception 'This plan supports up to % units', allowed_units;
    end if;
    return new;
end;
$$;

drop trigger if exists personal_fleet_unit_limit on public.personal_fleet_units;
create trigger personal_fleet_unit_limit
before insert on public.personal_fleet_units
for each row execute function public.enforce_personal_fleet_unit_limit();

alter table public.platform_users enable row level security;
alter table public.personal_fleet_accounts enable row level security;
alter table public.personal_fleet_members enable row level security;
alter table public.personal_fleet_invitations enable row level security;
alter table public.personal_fleet_units enable row level security;
alter table public.personal_fleet_repair_orders enable row level security;
alter table public.personal_fleet_technicians enable row level security;

drop policy if exists "platform users can read themselves" on public.platform_users;
create policy "platform users can read themselves" on public.platform_users
for select to authenticated using (user_id = auth.uid());

drop policy if exists "members can read personal fleet accounts" on public.personal_fleet_accounts;
create policy "members can read personal fleet accounts" on public.personal_fleet_accounts
for select to authenticated using (public.is_personal_fleet_member(id));

drop policy if exists "members can read personal fleet memberships" on public.personal_fleet_members;
create policy "members can read personal fleet memberships" on public.personal_fleet_members
for select to authenticated using (user_id = auth.uid() or public.is_personal_fleet_member(account_id));

drop policy if exists "members manage personal fleet units" on public.personal_fleet_units;
create policy "members manage personal fleet units" on public.personal_fleet_units
for all to authenticated
using (public.is_personal_fleet_member(account_id))
with check (public.is_personal_fleet_member(account_id));

drop policy if exists "members manage personal fleet repair orders" on public.personal_fleet_repair_orders;
create policy "members manage personal fleet repair orders" on public.personal_fleet_repair_orders
for all to authenticated
using (public.is_personal_fleet_member(account_id))
with check (public.is_personal_fleet_member(account_id));

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

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_personal_fleet_member(uuid) from public;
revoke all on function public.is_personal_fleet_manager(uuid) from public;
revoke all on function public.create_personal_fleet_invitation(text, text, timestamptz) from public;
revoke all on function public.get_personal_fleet_invitation(uuid) from public;
revoke all on function public.accept_personal_fleet_invitation(uuid) from public;
revoke all on function public.accept_personal_fleet_invitation(uuid, text) from public;
revoke all on function public.update_personal_fleet_name(text) from public;
revoke all on function public.list_personal_fleet_invitations() from public;
revoke all on function public.revoke_personal_fleet_invitation(uuid) from public;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_personal_fleet_member(uuid) to authenticated;
grant execute on function public.is_personal_fleet_manager(uuid) to authenticated;
grant select, insert, update, delete on public.personal_fleet_technicians to authenticated;
grant execute on function public.create_personal_fleet_invitation(text, text, timestamptz) to authenticated;
grant execute on function public.get_personal_fleet_invitation(uuid) to anon, authenticated;
grant execute on function public.accept_personal_fleet_invitation(uuid) to authenticated;
grant execute on function public.accept_personal_fleet_invitation(uuid, text) to authenticated;
grant execute on function public.update_personal_fleet_name(text) to authenticated;
grant execute on function public.list_personal_fleet_invitations() to authenticated;
grant execute on function public.revoke_personal_fleet_invitation(uuid) to authenticated;

-- After running this file, promote your existing login once. Replace the email:
-- insert into public.platform_users (user_id, role)
-- select id, 'platform_owner' from auth.users where lower(email) = lower('you@example.com')
-- on conflict (user_id) do update set role = excluded.role;
