-- Test first. Idempotent, version-checked technician-note synchronization.
begin;
create table if not exists public.shop_offline_note_operations (
 shop_id uuid not null references public.shops(id), request_id uuid not null,
 actor uuid not null, repair_order_id uuid not null references public.shop_repair_orders(id),
 expected_updated_at timestamptz not null, note text not null,
 result_updated_at timestamptz not null, created_at timestamptz not null default now(),
 primary key(shop_id,request_id)
);
alter table public.shop_offline_note_operations enable row level security;
revoke all on public.shop_offline_note_operations from public,anon,authenticated;
create or replace function public.sync_shop_offline_note(p_shop uuid,p_request uuid,p_ro uuid,p_expected timestamptz,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.shop_offline_note_operations; ro public.shop_repair_orders;
begin
 if p_shop is null or p_request is null or p_ro is null or p_expected is null or p_note is null or length(p_note)>20000 or auth.uid() is null then raise exception 'Invalid note request'; end if;
 if not public.shop_can_access_ro(p_shop,p_ro::text,'read') or not (public.shop_has_permission(p_shop,'repair_orders.write') or public.shop_can_access_ro(p_shop,p_ro::text,'work')) then raise exception 'Repair order is unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text||':'||p_request::text,0));
 select * into previous from public.shop_offline_note_operations where shop_id=p_shop and request_id=p_request;
 if found then
  if previous.actor<>auth.uid() or previous.repair_order_id<>p_ro or previous.expected_updated_at<>p_expected or previous.note<>p_note then raise exception 'Note request already used for different details'; end if;
  return jsonb_build_object('status','saved','updated_at',previous.result_updated_at);
 end if;
 select * into ro from public.shop_repair_orders where id=p_ro and shop_id=p_shop for update;
 if not found then raise exception 'Repair order is unavailable'; end if;
 if ro.updated_at is distinct from p_expected then return jsonb_build_object('status','conflict'); end if;
 update public.shop_repair_orders set technician_notes=p_note,updated_at=clock_timestamp() where id=p_ro and shop_id=p_shop returning * into ro;
 insert into public.shop_offline_note_operations(shop_id,request_id,actor,repair_order_id,expected_updated_at,note,result_updated_at)
 values(p_shop,p_request,auth.uid(),p_ro,p_expected,p_note,ro.updated_at);
 return jsonb_build_object('status','saved','updated_at',ro.updated_at);
end $$;
revoke all on function public.sync_shop_offline_note(uuid,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.sync_shop_offline_note(uuid,uuid,uuid,timestamptz,text) to authenticated;
commit;
