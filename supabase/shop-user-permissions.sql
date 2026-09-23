-- Granular Shop access layered over the existing role presets.
-- Owners retain full access. Overrides contain only differences from a role preset.

alter table public.shop_members
    add column if not exists permission_overrides jsonb not null default '{}'::jsonb;

alter table public.shop_members
    drop constraint if exists shop_members_permission_overrides_object;
alter table public.shop_members
    add constraint shop_members_permission_overrides_object
    check (jsonb_typeof(permission_overrides) = 'object');

create or replace function public.shop_role_permissions(member_role text)
returns jsonb language sql immutable set search_path=public as $$
    select case member_role
        when 'owner' then '{"*":true}'::jsonb
        when 'admin' then '{"customers.read":true,"customers.write":true,"repair_orders.read":true,"repair_orders.write":true,"repair_orders.update_work":true,"invoices.read":true,"invoices.write":true,"expenses.read":true,"expenses.write":true,"schedule.manage":true,"inspections.work":true,"requests.review":true,"team_documents.manage":true,"data.export":true,"data.import":true,"settings.manage":true,"users.manage":true}'::jsonb
        when 'service_writer' then '{"customers.read":true,"customers.write":true,"repair_orders.read":true,"repair_orders.write":true,"repair_orders.update_work":true,"invoices.read":true,"invoices.write":true,"expenses.read":true,"expenses.write":true,"schedule.manage":true,"inspections.work":true,"requests.review":true,"data.export":true}'::jsonb
        when 'technician' then '{"customers.read":true,"repair_orders.read":true,"repair_orders.update_work":true,"inspections.work":true}'::jsonb
        when 'read_only' then '{"customers.read":true,"repair_orders.read":true,"invoices.read":true,"expenses.read":true,"data.export":true}'::jsonb
        else '{}'::jsonb end;
$$;

create or replace function public.shop_has_permission(requested_shop_id uuid, requested_permission text)
returns boolean language sql stable security definer set search_path=public as $$
    select coalesce((
        select case
            when members.role='owner' then true
            when members.permission_overrides ? requested_permission
                then (members.permission_overrides->>requested_permission)::boolean
            else coalesce((public.shop_role_permissions(members.role)->>requested_permission)::boolean,false)
        end
        from public.shop_members members
        where members.shop_id=requested_shop_id and members.user_id=auth.uid() and members.is_active=true
    ),false);
$$;

drop function if exists public.list_my_shop_members();
create function public.list_my_shop_members()
returns table(user_id uuid,email text,role text,is_active boolean,permission_overrides jsonb,effective_permissions jsonb)
language sql stable security definer set search_path=public as $$
    select members.user_id,users.email::text,members.role,members.is_active,members.permission_overrides,
        public.shop_role_permissions(members.role) || members.permission_overrides
    from public.shop_members members join auth.users users on users.id=members.user_id
    where members.shop_id in (
        select mine.shop_id from public.shop_members mine
        where mine.user_id=auth.uid() and mine.is_active=true
          and public.shop_has_permission(mine.shop_id,'users.manage')
    )
    order by case when members.role='owner' then 0 else 1 end,users.email;
$$;

create or replace function public.update_shop_member_access(
    target_user_id uuid,
    new_role text,
    permission_overrides jsonb,
    active boolean
) returns void language plpgsql security definer set search_path=public as $$
declare
    actor_shop uuid;
    target public.shop_members%rowtype;
    invalid_key text;
begin
    select shop_id into actor_shop from public.shop_members
    where user_id=auth.uid() and is_active=true
      and public.shop_has_permission(shop_id,'users.manage') limit 1;
    if actor_shop is null then raise exception 'User-management permission is required'; end if;
    select * into target from public.shop_members
    where shop_id=actor_shop and user_id=target_user_id for update;
    if target.user_id is null then raise exception 'Shop user not found'; end if;
    if target.role='owner' then raise exception 'Owner access cannot be changed here'; end if;
    if target_user_id=auth.uid() and active=false then
        raise exception 'You cannot disable your own account';
    end if;
    if new_role not in ('admin','service_writer','technician','read_only') then raise exception 'Invalid role'; end if;
    if jsonb_typeof(coalesce(permission_overrides,'{}'::jsonb)) <> 'object' then
        raise exception 'Permission overrides must be an object';
    end if;
    select permission_key into invalid_key
    from jsonb_object_keys(coalesce(permission_overrides,'{}'::jsonb)) as keys(permission_key)
    where permission_key <> all(array[
        'expenses.write','requests.review','team_documents.manage',
        'data.export','data.import','users.manage'
    ]) limit 1;
    if invalid_key is not null then raise exception 'Unknown permission: %',invalid_key; end if;
    if exists (
        select 1 from jsonb_each(coalesce(permission_overrides,'{}'::jsonb))
        where jsonb_typeof(value) <> 'boolean'
    ) then raise exception 'Permission overrides must be true or false'; end if;
    update public.shop_members set role=$2,
        permission_overrides=coalesce($3,'{}'::jsonb),is_active=$4
    where shop_id=actor_shop and user_id=$1;
end;
$$;

-- Membership changes go through the protected function; direct table writes are removed.
drop policy if exists "owners and admins manage shop members" on public.shop_members;
revoke insert,update,delete on public.shop_members from authenticated;
grant select on public.shop_members to authenticated;

-- Accounts payable and its private files honor per-user finance permissions.
drop policy if exists "finance users view accounts payable" on public.shop_accounts_payable;
create policy "finance users view accounts payable" on public.shop_accounts_payable for select to authenticated
using(public.shop_has_permission(shop_id,'expenses.read') or public.shop_has_permission(shop_id,'expenses.write'));
drop policy if exists "finance users create accounts payable" on public.shop_accounts_payable;
create policy "finance users create accounts payable" on public.shop_accounts_payable for insert to authenticated
with check(created_by=auth.uid() and public.shop_has_permission(shop_id,'expenses.write'));
drop policy if exists "finance users update accounts payable" on public.shop_accounts_payable;
create policy "finance users update accounts payable" on public.shop_accounts_payable for update to authenticated
using(public.shop_has_permission(shop_id,'expenses.write'))
with check(public.shop_has_permission(shop_id,'expenses.write'));
drop policy if exists "finance users view ap documents" on storage.objects;
create policy "finance users view ap documents" on storage.objects for select to authenticated
using(bucket_id='shop-ap-documents' and (
    public.shop_has_permission((storage.foldername(name))[1]::uuid,'expenses.read')
    or public.shop_has_permission((storage.foldername(name))[1]::uuid,'expenses.write')
));
drop policy if exists "finance users upload ap documents" on storage.objects;
create policy "finance users upload ap documents" on storage.objects for insert to authenticated
with check(bucket_id='shop-ap-documents' and public.shop_has_permission((storage.foldername(name))[1]::uuid,'expenses.write'));

-- Private personnel records require explicit management permission or explicit self visibility.
drop policy if exists "authorized users view team documents" on public.shop_team_documents;
create policy "authorized users view team documents" on public.shop_team_documents for select to authenticated
using(public.shop_has_permission(shop_id,'team_documents.manage') or (visible_to_subject=true and subject_user_id=auth.uid()));
drop policy if exists "owners and admins create team documents" on public.shop_team_documents;
create policy "owners and admins create team documents" on public.shop_team_documents for insert to authenticated
with check(uploaded_by=auth.uid() and public.shop_has_permission(shop_id,'team_documents.manage'));
drop policy if exists "owners and admins update team documents" on public.shop_team_documents;
create policy "owners and admins update team documents" on public.shop_team_documents for update to authenticated
using(public.shop_has_permission(shop_id,'team_documents.manage'))
with check(public.shop_has_permission(shop_id,'team_documents.manage'));
drop policy if exists "authorized users view team document files" on storage.objects;
create policy "authorized users view team document files" on storage.objects for select to authenticated
using(bucket_id='shop-team-documents' and exists(
    select 1 from public.shop_team_documents documents where documents.object_path=name and (
        public.shop_has_permission(documents.shop_id,'team_documents.manage')
        or (documents.visible_to_subject=true and documents.subject_user_id=auth.uid())
    )
));
drop policy if exists "owners and admins upload team document files" on storage.objects;
create policy "owners and admins upload team document files" on storage.objects for insert to authenticated
with check(bucket_id='shop-team-documents' and public.shop_has_permission((storage.foldername(name))[1]::uuid,'team_documents.manage'));

-- Protected workflows also check the effective permission server-side.
drop policy if exists "members view own and office views all requests" on public.shop_requests;
create policy "members view own and office views all requests" on public.shop_requests for select to authenticated
using(requested_by=auth.uid() or public.shop_has_permission(shop_id,'requests.review'));

create or replace function public.create_shop_invitation(invited_email text,invited_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
    current_shop_id uuid;
    new_token uuid;
begin
    select shop_id into current_shop_id from public.shop_members
    where user_id=auth.uid() and is_active=true
      and public.shop_has_permission(shop_id,'users.manage') limit 1;
    if current_shop_id is null then raise exception 'User-management permission is required'; end if;
    if invited_role not in ('admin','service_writer','technician','read_only') then
        raise exception 'Invalid role';
    end if;
    insert into public.shop_invitations(shop_id,email,role,invited_by)
    values(current_shop_id,lower(trim(invited_email)),invited_role,auth.uid())
    returning token into new_token;
    return new_token;
end;
$$;

create or replace function public.review_shop_request(
    request_id uuid,
    decision text,
    office_notes text default null,
    add_to_calendar boolean default true,
    reminder_at timestamptz default null
) returns public.shop_requests
language plpgsql security definer set search_path=public as $$
declare
    target public.shop_requests;
begin
    select * into target from public.shop_requests where id=request_id for update;
    if target.id is null then raise exception 'Request not found'; end if;
    if not public.shop_has_permission(target.shop_id,'requests.review') then
        raise exception 'Request-review permission is required';
    end if;
    if decision not in ('approved','declined') then raise exception 'Invalid decision'; end if;
    update public.shop_requests set status=decision,reviewer_notes=nullif(trim(office_notes),''),
        reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=request_id returning * into target;
    if decision='approved' and add_to_calendar and target.starts_on is not null then
        insert into public.shop_calendar_events(
            shop_id,source_request_id,title,starts_on,ends_on,subject_user_id,
            office_reminder_at,notes,created_by
        ) values(
            target.shop_id,target.id,target.title,target.starts_on,
            coalesce(target.ends_on,target.starts_on),target.requested_by,
            reminder_at,target.details,auth.uid()
        ) on conflict(source_request_id) do update set
            title=excluded.title,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
            subject_user_id=excluded.subject_user_id,office_reminder_at=excluded.office_reminder_at,
            notes=excluded.notes,updated_at=now();
    else
        delete from public.shop_calendar_events where source_request_id=target.id;
    end if;
    return target;
end;
$$;

create or replace function public.restore_shop_data_backup(backup jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target_shop uuid;
    item jsonb;
    restored integer := 0;
    affected integer := 0;
begin
    if backup->>'format' <> 'track-right-shop-backup'
       or coalesce((backup->>'version')::integer,0) <> 2 then
        raise exception 'Unsupported Track Right Shop backup';
    end if;
    target_shop := (backup->>'source_shop_id')::uuid;
    if not public.shop_has_permission(target_shop,'data.import') then
        raise exception 'Data-import permission is required';
    end if;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,customers}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Customer tenant validation failed'; end if;
        insert into public."Customers" select * from jsonb_populate_record(null::public."Customers",item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,units}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Unit tenant validation failed'; end if;
        insert into public.customer_units select * from jsonb_populate_record(null::public.customer_units,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,repair_orders}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Repair order tenant validation failed'; end if;
        insert into public.shop_repair_orders select * from jsonb_populate_record(null::public.shop_repair_orders,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Invoice tenant validation failed'; end if;
        insert into public.shop_invoices select * from jsonb_populate_record(null::public.shop_invoices,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,accounts_payable}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Accounts payable tenant validation failed'; end if;
        insert into public.shop_accounts_payable select * from jsonb_populate_record(null::public.shop_accounts_payable,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,requests}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Request tenant validation failed'; end if;
        insert into public.shop_requests select * from jsonb_populate_record(null::public.shop_requests,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,calendar}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Calendar tenant validation failed'; end if;
        insert into public.shop_calendar_events select * from jsonb_populate_record(null::public.shop_calendar_events,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    return jsonb_build_object('restored',restored);
end;
$$;

revoke all on function public.shop_role_permissions(text) from public;
revoke all on function public.shop_has_permission(uuid,text) from public;
revoke all on function public.list_my_shop_members() from public;
revoke all on function public.update_shop_member_access(uuid,text,jsonb,boolean) from public;
grant execute on function public.shop_role_permissions(text) to authenticated;
grant execute on function public.shop_has_permission(uuid,text) to authenticated;
grant execute on function public.list_my_shop_members() to authenticated;
grant execute on function public.update_shop_member_access(uuid,text,jsonb,boolean) to authenticated;
