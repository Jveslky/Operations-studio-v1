begin;

create table if not exists public.shop_beta_invitations (
    id uuid primary key default gen_random_uuid(),
    token uuid not null unique default gen_random_uuid(),
    email text not null,
    shop_name text not null check (char_length(trim(shop_name)) between 2 and 120),
    plan_code text not null default 'shop_beta',
    billing_status text not null default 'complimentary',
    invited_by uuid not null references auth.users(id),
    expires_at timestamptz,
    accepted_at timestamptz,
    accepted_by uuid references auth.users(id),
    created_shop_id uuid references public.shops(id),
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.shop_beta_invitations enable row level security;

create or replace function public.create_shop_beta_invitation(
    invited_email text,
    requested_shop_name text,
    requested_expires_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_token uuid;
begin
    if not public.is_platform_admin() then
        raise exception 'Platform administrator access required';
    end if;
    if invited_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
        raise exception 'Enter a valid email address';
    end if;
    if char_length(trim(coalesce(requested_shop_name,''))) < 2 then
        raise exception 'A shop name is required';
    end if;

    update public.shop_beta_invitations set revoked_at=now()
    where lower(email)=lower(trim(invited_email))
      and accepted_at is null and revoked_at is null;

    insert into public.shop_beta_invitations(email,shop_name,invited_by,expires_at)
    values(lower(trim(invited_email)),trim(requested_shop_name),auth.uid(),requested_expires_at)
    returning token into new_token;
    return new_token;
end;
$$;

create or replace function public.get_shop_beta_invitation(invitation_token uuid)
returns table(shop_name text,email text,plan_code text)
language sql stable security definer set search_path=public as $$
    select invitations.shop_name,invitations.email,invitations.plan_code
    from public.shop_beta_invitations invitations
    where invitations.token=invitation_token
      and invitations.accepted_at is null
      and invitations.revoked_at is null
      and (invitations.expires_at is null or invitations.expires_at>now());
$$;

create or replace function public.accept_shop_beta_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
    invitation public.shop_beta_invitations%rowtype;
    login_email text;
    existing_shop_id uuid;
    new_shop_id uuid;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    select lower(email) into login_email from auth.users where id=auth.uid();

    select * into invitation from public.shop_beta_invitations
    where token=invitation_token and accepted_at is null and revoked_at is null
      and (expires_at is null or expires_at>now()) for update;

    if invitation.id is null then raise exception 'Invitation is invalid or no longer available'; end if;
    if login_email<>lower(invitation.email) then raise exception 'Use the email address that was invited'; end if;

    select shop_id into existing_shop_id from public.shop_members
    where user_id=auth.uid() and is_active=true limit 1;
    if existing_shop_id is not null then
        raise exception 'This login already belongs to a shop';
    end if;

    insert into public.shops(name,created_by)
    values(invitation.shop_name,auth.uid()) returning id into new_shop_id;
    insert into public.shop_members(shop_id,user_id,role,is_active)
    values(new_shop_id,auth.uid(),'owner',true);

    update public.shop_beta_invitations
    set accepted_at=now(),accepted_by=auth.uid(),created_shop_id=new_shop_id
    where id=invitation.id;
    return new_shop_id;
end;
$$;

create or replace function public.list_shop_beta_invitations()
returns table(id uuid,email text,shop_name text,plan_code text,created_at timestamptz,
    expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz,created_shop_id uuid)
language plpgsql stable security definer set search_path=public as $$
begin
    if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
    return query select invitations.id,invitations.email,invitations.shop_name,invitations.plan_code,
        invitations.created_at,invitations.expires_at,invitations.accepted_at,
        invitations.revoked_at,invitations.created_shop_id
    from public.shop_beta_invitations invitations order by invitations.created_at desc;
end;
$$;

create or replace function public.revoke_shop_beta_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
    if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
    update public.shop_beta_invitations set revoked_at=now()
    where id=invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

revoke all on function public.create_shop_beta_invitation(text,text,timestamptz) from public;
revoke all on function public.get_shop_beta_invitation(uuid) from public;
revoke all on function public.accept_shop_beta_invitation(uuid) from public;
revoke all on function public.list_shop_beta_invitations() from public;
revoke all on function public.revoke_shop_beta_invitation(uuid) from public;
grant execute on function public.create_shop_beta_invitation(text,text,timestamptz) to authenticated;
grant execute on function public.get_shop_beta_invitation(uuid) to anon,authenticated;
grant execute on function public.accept_shop_beta_invitation(uuid) to authenticated;
grant execute on function public.list_shop_beta_invitations() to authenticated;
grant execute on function public.revoke_shop_beta_invitation(uuid) to authenticated;

-- Existing members may still resolve their workspace, but new public users
-- must use a Shop beta invitation. Platform admins retain a recovery path.
create or replace function public.bootstrap_my_shop(requested_shop_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_shop_id uuid;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    select shop_id into new_shop_id from public.shop_members
    where user_id=auth.uid() and is_active=true limit 1;

    if new_shop_id is not null then
        update public.shop_members members set role='owner'
        where members.shop_id=new_shop_id and members.user_id=auth.uid()
          and not exists(select 1 from public.shop_members owners where owners.shop_id=new_shop_id and owners.is_active=true and owners.role='owner')
          and 1=(select count(*) from public.shop_members active_members where active_members.shop_id=new_shop_id and active_members.is_active=true);
        update public.shops set created_by=auth.uid()
        where id=new_shop_id and created_by is null
          and exists(select 1 from public.shop_members owners where owners.shop_id=new_shop_id and owners.user_id=auth.uid() and owners.role='owner' and owners.is_active=true);
        return new_shop_id;
    end if;

    if not public.is_platform_admin() then
        raise exception 'Shop beta invitation required';
    end if;
    if char_length(trim(coalesce(requested_shop_name,'')))<2 then raise exception 'A shop name is required'; end if;
    insert into public.shops(name,created_by) values(trim(requested_shop_name),auth.uid()) returning id into new_shop_id;
    insert into public.shop_members(shop_id,user_id,role) values(new_shop_id,auth.uid(),'owner');
    return new_shop_id;
end;
$$;

commit;
