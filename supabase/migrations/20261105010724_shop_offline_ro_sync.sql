-- Durable replay records for supported offline RO details.
-- Apply to Test before deploying the corresponding browser queue.
begin;
set local lock_timeout='5s';
do $preflight$
begin
 if to_regprocedure('public.shop_can_access_ro(uuid,text,text)') is null
    or to_regprocedure('public.shop_has_permission(uuid,text)') is null then
  raise exception 'Install Shop role/workspace permissions before offline RO sync';
 end if;
end $preflight$;
create table if not exists public.shop_offline_ro_operations (
 shop_id uuid not null references public.shops(id),
 request_id uuid not null,
 actor uuid not null,
 repair_order_id uuid not null references public.shop_repair_orders(id),
 expected_updated_at timestamptz not null,
 patch jsonb not null,
 result_updated_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(shop_id,request_id)
);
alter table public.shop_offline_ro_operations enable row level security;
revoke all on public.shop_offline_ro_operations from public,anon,authenticated;
grant all on public.shop_offline_ro_operations to service_role;
CREATE OR REPLACE FUNCTION public.sync_shop_offline_ro(p_shop uuid, p_request uuid, p_ro uuid, p_expected timestamp with time zone, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.shop_offline_ro_operations; ro public.shop_repair_orders;
 field text; value jsonb; writer boolean; actor_id uuid:=auth.uid();
begin
 if actor_id is null or p_shop is null or p_request is null or p_ro is null or p_expected is null
    or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb
    or octet_length(p_patch::text)>150000 then raise exception 'Invalid offline repair-order request'; end if;
 for field,value in select * from jsonb_each(p_patch) loop
  if field not in ('complaint','parts_needed','customer_notes','technician_notes','additional_work_performed','labor_hours','priority') then raise exception 'This field requires an online save'; end if;
  if field='labor_hours' then
   if jsonb_typeof(value)<>'number' or (value::text)::numeric<0 or (value::text)::numeric>100000 then raise exception 'Invalid labor hours'; end if;
  elsif jsonb_typeof(value)<>'string' or length(value#>>'{}')>20000 then raise exception 'Invalid repair-order text';
  end if;
  if field='priority' and (value#>>'{}') not in ('Low','Medium','High','Critical','Normal') then raise exception 'Invalid priority'; end if;
 end loop;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop::text||':'||p_request::text,0));
 select * into ro from public.shop_repair_orders where id=p_ro and shop_id=p_shop for update;
 if not found or not public.shop_can_access_ro(p_shop,p_ro::text,'read') then raise exception 'Repair order is unavailable'; end if;
 writer:=public.shop_has_permission(p_shop,'repair_orders.write');
 if not writer and (not public.shop_can_access_ro(p_shop,p_ro::text,'work') or
   exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('technician_notes','labor_hours','additional_work_performed'))) then raise exception 'Repair order is unavailable'; end if;
 select * into previous from public.shop_offline_ro_operations where shop_id=p_shop and request_id=p_request;
 if found then
  if previous.actor<>actor_id or previous.repair_order_id<>p_ro or previous.expected_updated_at<>p_expected or previous.patch<>p_patch then raise exception 'Offline request already used for different details'; end if;
  return jsonb_build_object('status','saved','updated_at',previous.result_updated_at);
 end if;
 if ro.updated_at is distinct from p_expected then return jsonb_build_object('status','conflict'); end if;
 update public.shop_repair_orders set
  complaint=case when p_patch?'complaint' then p_patch->>'complaint' else complaint end,
  parts_needed=case when p_patch?'parts_needed' then p_patch->>'parts_needed' else parts_needed end,
  customer_notes=case when p_patch?'customer_notes' then p_patch->>'customer_notes' else customer_notes end,
  technician_notes=case when p_patch?'technician_notes' then p_patch->>'technician_notes' else technician_notes end,
  additional_work_performed=case when p_patch?'additional_work_performed' then p_patch->>'additional_work_performed' else additional_work_performed end,
  labor_hours=case when p_patch?'labor_hours' then (p_patch->>'labor_hours')::numeric else labor_hours end,
  priority=case when p_patch?'priority' then p_patch->>'priority' else priority end,
  updated_at=clock_timestamp()
 where id=p_ro and shop_id=p_shop returning * into ro;
 insert into public.shop_offline_ro_operations(shop_id,request_id,actor,repair_order_id,expected_updated_at,patch,result_updated_at)
 values(p_shop,p_request,actor_id,p_ro,p_expected,p_patch,ro.updated_at);
 return jsonb_build_object('status','saved','updated_at',ro.updated_at);
end $function$

;
revoke all on function public.sync_shop_offline_ro(uuid,uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.sync_shop_offline_ro(uuid,uuid,uuid,timestamptz,jsonb) to authenticated,service_role;
commit;
