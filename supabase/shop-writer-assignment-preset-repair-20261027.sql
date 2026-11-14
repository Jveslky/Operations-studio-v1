-- Test repair: preserve the installed role presets and add writer assignment.
-- Individual permission overrides continue to take precedence in shop_has_permission.
-- Run as a single transaction; rerunning leaves the captured preset unchanged.
begin;
do $repair$
declare original_definition text; helper_definition text;
begin
 if to_regprocedure('public.shop_role_permissions(text)') is null
    or to_regprocedure('public.shop_has_permission(uuid,text)') is null then
  raise exception 'Permission prerequisites missing; no changes applied';
 end if;
 if to_regprocedure('public.shop_role_permissions_before_writer_assignment_20261027(text)') is null then
  select pg_get_functiondef('public.shop_role_permissions(text)'::regprocedure) into original_definition;
  helper_definition := replace(original_definition,
   'FUNCTION public.shop_role_permissions(',
   'FUNCTION public.shop_role_permissions_before_writer_assignment_20261027(');
  if helper_definition = original_definition then
   raise exception 'Could not safely capture existing role preset; no changes applied';
  end if;
  execute helper_definition;
 end if;
end $repair$;
create or replace function public.shop_role_permissions(member_role text)
returns jsonb language sql immutable set search_path=public as $$
 select public.shop_role_permissions_before_writer_assignment_20261027(member_role)
  || case when member_role='service_writer' then '{"repair_orders.assign":true}'::jsonb else '{}'::jsonb end;
$$;
do $verify$
begin
 if not coalesce((public.shop_role_permissions('service_writer')->>'repair_orders.assign')::boolean,false)
 or public.shop_role_permissions('technician') is distinct from public.shop_role_permissions_before_writer_assignment_20261027('technician')
 or public.shop_role_permissions('admin') is distinct from public.shop_role_permissions_before_writer_assignment_20261027('admin') then
  raise exception 'Permission preset verification failed; no changes applied';
 end if;
end $verify$;
commit;
