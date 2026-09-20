-- Track Right Personal Fleet display names
-- Run once in the Supabase SQL editor. Safe to run more than once.

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

revoke all on function public.accept_personal_fleet_invitation(uuid, text) from public;
revoke all on function public.update_personal_fleet_name(text) from public;
grant execute on function public.accept_personal_fleet_invitation(uuid, text) to authenticated;
grant execute on function public.update_personal_fleet_name(text) to authenticated;
