-- Run once in the Supabase SQL editor before enabling signup in production.
create extension if not exists pgcrypto;

create table if not exists public.shops (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 2 and 120),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

alter table public.shops
    add column if not exists created_by uuid references auth.users(id),
    add column if not exists created_at timestamptz not null default now();

create table if not exists public.shop_members (
    shop_id uuid not null references public.shops(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'technician'
        check (role in ('owner', 'admin', 'service_writer', 'technician', 'read_only')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (shop_id, user_id)
);

alter table public.shop_members
    add column if not exists role text not null default 'technician',
    add column if not exists is_active boolean not null default true,
    add column if not exists created_at timestamptz not null default now();

-- Repair shops created before roles/ownership were introduced. This only
-- promotes the sole active member of a shop that does not already have an
-- owner, so it cannot silently take ownership away from another account.
with sole_members as (
    select shop_id, min(user_id::text)::uuid as user_id
    from public.shop_members
    where is_active = true
    group by shop_id
    having count(*) = 1
), ownerless_shops as (
    select shops.id
    from public.shops shops
    where not exists (
        select 1
        from public.shop_members owners
        where owners.shop_id = shops.id
          and owners.is_active = true
          and owners.role = 'owner'
    )
)
update public.shop_members members
set role = 'owner'
from sole_members, ownerless_shops
where members.shop_id = sole_members.shop_id
  and members.user_id = sole_members.user_id
  and members.shop_id = ownerless_shops.id;

update public.shops shops
set created_by = owners.user_id
from public.shop_members owners
where shops.id = owners.shop_id
  and shops.created_by is null
  and owners.role = 'owner'
  and owners.is_active = true;

create or replace function public.is_shop_member(requested_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.shop_members
        where shop_id = requested_shop_id
          and user_id = auth.uid()
          and is_active = true
    );
$$;

create or replace function public.has_shop_role(requested_shop_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.shop_members
        where shop_id = requested_shop_id
          and user_id = auth.uid()
          and is_active = true
          and role = any(allowed_roles)
    );
$$;

create or replace function public.bootstrap_my_shop(requested_shop_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    new_shop_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select shop_id into new_shop_id
    from public.shop_members
    where user_id = auth.uid() and is_active = true
    limit 1;

    if new_shop_id is not null then
        -- A legacy sole-member shop may predate the role column. Repair that
        -- account when it is safe to do so, then return the existing shop.
        update public.shop_members members
        set role = 'owner'
        where members.shop_id = new_shop_id
          and members.user_id = auth.uid()
          and not exists (
              select 1
              from public.shop_members owners
              where owners.shop_id = new_shop_id
                and owners.is_active = true
                and owners.role = 'owner'
          )
          and 1 = (
              select count(*)
              from public.shop_members active_members
              where active_members.shop_id = new_shop_id
                and active_members.is_active = true
          );

        update public.shops
        set created_by = auth.uid()
        where id = new_shop_id
          and created_by is null
          and exists (
              select 1
              from public.shop_members owners
              where owners.shop_id = new_shop_id
                and owners.user_id = auth.uid()
                and owners.role = 'owner'
                and owners.is_active = true
          );

        return new_shop_id;
    end if;

    if char_length(trim(coalesce(requested_shop_name, ''))) < 2 then
        raise exception 'A shop name is required';
    end if;

    insert into public.shops (name, created_by)
    values (trim(requested_shop_name), auth.uid())
    returning id into new_shop_id;

    insert into public.shop_members (shop_id, user_id, role)
    values (new_shop_id, auth.uid(), 'owner');

    return new_shop_id;
end;
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;

drop policy if exists "members can view their shop" on public.shops;
create policy "members can view their shop" on public.shops
for select to authenticated using (public.is_shop_member(id));

drop policy if exists "members can view shop members" on public.shop_members;
create policy "members can view shop members" on public.shop_members
for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists "owners and admins manage shop members" on public.shop_members;
create policy "owners and admins manage shop members" on public.shop_members
for all to authenticated
using (
    public.has_shop_role(shop_id, array['owner', 'admin'])
    and (role <> 'owner' or public.has_shop_role(shop_id, array['owner']))
)
with check (
    public.has_shop_role(shop_id, array['owner', 'admin'])
    and (role <> 'owner' or public.has_shop_role(shop_id, array['owner']))
);

grant execute on function public.bootstrap_my_shop(text) to authenticated;
grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.has_shop_role(uuid, text[]) to authenticated;

create table if not exists public.shop_invitations (
    id uuid primary key default gen_random_uuid(),
    token uuid not null unique default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    email text not null,
    role text not null check (role in ('admin', 'service_writer', 'technician', 'read_only')),
    invited_by uuid not null references auth.users(id),
    expires_at timestamptz not null default (now() + interval '7 days'),
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.shop_invitations enable row level security;

create or replace function public.create_shop_invitation(invited_email text, invited_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    current_shop_id uuid;
    new_token uuid;
begin
    select shop_id into current_shop_id
    from public.shop_members
    where user_id = auth.uid()
      and is_active = true
      and role in ('owner', 'admin')
    limit 1;

    if current_shop_id is null then
        raise exception 'Owner or admin access required';
    end if;

    if invited_role not in ('admin', 'service_writer', 'technician', 'read_only') then
        raise exception 'Invalid role';
    end if;

    insert into public.shop_invitations (shop_id, email, role, invited_by)
    values (current_shop_id, lower(trim(invited_email)), invited_role, auth.uid())
    returning token into new_token;

    return new_token;
end;
$$;

create or replace function public.get_shop_invitation(invitation_token uuid)
returns table (shop_name text, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
    select shops.name, invitations.email, invitations.role
    from public.shop_invitations invitations
    join public.shops on shops.id = invitations.shop_id
    where invitations.token = invitation_token
      and invitations.accepted_at is null
      and invitations.expires_at > now();
$$;

create or replace function public.accept_shop_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    invitation public.shop_invitations%rowtype;
    login_email text;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;

    select lower(email) into login_email from auth.users where id = auth.uid();
    select * into invitation
    from public.shop_invitations
    where token = invitation_token and accepted_at is null and expires_at > now()
    for update;

    if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
    if login_email <> lower(invitation.email) then raise exception 'Use the email address that was invited'; end if;

    insert into public.shop_members (shop_id, user_id, role)
    values (invitation.shop_id, auth.uid(), invitation.role)
    on conflict (shop_id, user_id)
    do update set role = excluded.role, is_active = true;

    update public.shop_invitations set accepted_at = now() where id = invitation.id;
    return invitation.shop_id;
end;
$$;

create or replace function public.list_my_shop_members()
returns table (user_id uuid, email text, role text, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
    select members.user_id, users.email::text, members.role, members.is_active
    from public.shop_members members
    join auth.users users on users.id = members.user_id
    where members.shop_id in (
        select mine.shop_id from public.shop_members mine
        where mine.user_id = auth.uid()
          and mine.is_active = true
          and mine.role in ('owner', 'admin')
    )
    order by users.email;
$$;

revoke execute on function public.bootstrap_my_shop(text) from public;
revoke execute on function public.is_shop_member(uuid) from public;
revoke execute on function public.has_shop_role(uuid, text[]) from public;
revoke execute on function public.create_shop_invitation(text, text) from public;
revoke execute on function public.get_shop_invitation(uuid) from public;
revoke execute on function public.accept_shop_invitation(uuid) from public;
revoke execute on function public.list_my_shop_members() from public;

grant execute on function public.bootstrap_my_shop(text) to authenticated;
grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.has_shop_role(uuid, text[]) to authenticated;
grant execute on function public.create_shop_invitation(text, text) to authenticated;
grant execute on function public.get_shop_invitation(uuid) to anon, authenticated;
grant execute on function public.accept_shop_invitation(uuid) to authenticated;
grant execute on function public.list_my_shop_members() to authenticated;
