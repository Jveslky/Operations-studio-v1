-- Apply after shop-inventory-foundation-20261016.sql. No AP overrides are changed.
begin;
create or replace function public.shop_role_permissions(member_role text)
returns jsonb language sql immutable set search_path=public as $$
    select case member_role
        when 'owner' then '{"*":true}'::jsonb
        when 'admin' then '{"inventory.manage":true,"inventory.read":true,"inventory.receive":true,"customers.read":true,"customers.write":true,"repair_orders.read":true,"repair_orders.write":true,"repair_orders.update_work":true,"invoices.read":true,"invoices.write":true,"expenses.read":true,"expenses.write":true,"schedule.manage":true,"inspections.work":true,"requests.review":true,"team_documents.manage":true,"data.export":true,"data.import":true,"settings.manage":true,"users.manage":true}'::jsonb
        when 'service_writer' then '{"inventory.read":true,"inventory.receive":true,"customers.read":true,"customers.write":true,"repair_orders.read":true,"repair_orders.write":true,"repair_orders.update_work":true,"invoices.read":true,"invoices.write":true,"schedule.manage":true,"inspections.work":true,"requests.review":true,"data.export":true}'::jsonb
        when 'technician' then '{"repair_orders.read":true,"repair_orders.update_work":true,"inspections.work":true}'::jsonb
        when 'read_only' then '{"customers.read":true,"repair_orders.read":true,"invoices.read":true,"expenses.read":true,"data.export":true}'::jsonb
        else '{}'::jsonb end;
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
    select * into target from public.shop_members where shop_id=actor_shop and user_id=target_user_id for update;
    if target.user_id is null then raise exception 'Shop user not found'; end if;
    if target.role='owner' then raise exception 'Owner access cannot be changed here'; end if;
    if target_user_id=auth.uid() and active=false then raise exception 'You cannot disable your own account'; end if;
    if new_role not in ('admin','service_writer','technician','read_only') then raise exception 'Invalid role'; end if;
    if jsonb_typeof(coalesce(permission_overrides,'{}'::jsonb)) <> 'object' then raise exception 'Permission overrides must be an object'; end if;
    select permission_key into invalid_key
    from jsonb_object_keys(coalesce(permission_overrides,'{}'::jsonb)) as keys(permission_key)
    where permission_key <> all(array[
        'inventory.read','inventory.receive','inventory.manage','expenses.read','expenses.write','requests.review','team_documents.manage',
        'data.export','data.import','users.manage'
    ]) limit 1;
    if invalid_key is not null then raise exception 'Unknown permission: %',invalid_key; end if;
    if exists (select 1 from jsonb_each(coalesce(permission_overrides,'{}'::jsonb)) where jsonb_typeof(value) <> 'boolean') then
        raise exception 'Permission overrides must be true or false';
    end if;
    update public.shop_members set role=$2,permission_overrides=coalesce($3,'{}'::jsonb),is_active=$4
    where shop_id=actor_shop and user_id=$1;
end;
$$;

create or replace function public.shop_inventory_can(p_shop uuid,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null
 and public.has_shop_role(p_shop,array['owner','admin','service_writer'])
 and public.shop_has_permission(p_shop,'inventory.read')
 and case p_action when 'read' then true when 'receive' then public.shop_has_permission(p_shop,'inventory.receive')
 when 'manage' then public.has_shop_role(p_shop,array['owner','admin']) and public.shop_has_permission(p_shop,'inventory.manage') else false end;
$$;

commit;
