-- Apply after shop-personal-alerts-20261021.sql, inventory/RO stock, payment ledger, team documents and requests.
begin;
alter table public.shop_alert_rules drop constraint if exists shop_alert_rules_event_type_check;
alter table public.shop_alert_rules add constraint shop_alert_rules_event_type_check check(event_type in ('ro_assigned','estimate_approved','stock_low','payment_recorded','team_document_shared','pto_requested'));
alter table public.shop_alert_preferences drop constraint if exists shop_alert_preferences_event_type_check;
alter table public.shop_alert_preferences add constraint shop_alert_preferences_event_type_check check(event_type in ('ro_assigned','estimate_approved','stock_low','payment_recorded','team_document_shared','pto_requested'));
alter table public.shop_alert_events drop constraint if exists shop_alert_events_event_type_check;
alter table public.shop_alert_events add constraint shop_alert_events_event_type_check check(event_type in ('ro_assigned','estimate_approved','stock_low','payment_recorded','team_document_shared','pto_requested'));
alter table public.shop_alert_events alter column repair_order_id drop not null;
alter table public.shop_alert_events add column if not exists source_record_id uuid;
alter table public.shop_alert_events add column if not exists resolved_at timestamptz;
create table if not exists public.shop_stock_alert_state (
 shop_id uuid not null, item_id uuid primary key references public.shop_inventory_items(id),
 is_low boolean not null, episode_id uuid, foreign key(shop_id,item_id) references public.shop_inventory_items(shop_id,id)
);
alter table public.shop_stock_alert_state enable row level security;
revoke all on public.shop_stock_alert_state from public,anon,authenticated;
-- Establish the baseline without notifying about historical low stock.
insert into shop_stock_alert_state(shop_id,item_id,is_low)
select i.shop_id,i.id,not i.archived and c.available<=i.reorder_point
from shop_inventory_items i cross join lateral public.shop_stock_counts(i.shop_id,i.id) c
on conflict(item_id) do nothing;
create or replace function public.shop_alert_member(s uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from shop_members where shop_id=s and user_id=auth.uid() and is_active
 and role in ('owner','admin','service_writer','technician'))
$$;
create or replace function public.shop_alert_type_allowed(s uuid,k text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.shop_alert_member(s) and case k
 when 'ro_assigned' then public.shop_has_permission(s,'repair_orders.read')
 when 'estimate_approved' then public.shop_has_permission(s,'repair_orders.read')
 when 'stock_low' then public.shop_inventory_can(s,'read')
 when 'payment_recorded' then public.has_shop_role(s,array['owner','admin','service_writer']) and public.shop_has_permission(s,'invoices.read')
 when 'pto_requested' then public.has_shop_role(s,array['owner','admin','service_writer']) and public.shop_has_permission(s,'requests.review')
 when 'team_document_shared' then true else false end
$$;
create or replace function public.shop_alert_visible(e public.shop_alert_events) returns boolean
language sql stable security definer set search_path=public as $$
 select public.shop_alert_type_allowed(e.shop_id,e.event_type) and case
 when e.event_type in ('ro_assigned','estimate_approved') then exists(
 select 1 from shop_repair_orders r join shop_members m on m.shop_id=r.shop_id and m.user_id=auth.uid() and m.is_active
 where r.id=e.repair_order_id and r.shop_id=e.shop_id
 and (m.role in ('owner','admin','service_writer') or auth.uid() in(r.technician_user_id,r.additional_technician_user_id)))
 and public.shop_can_access_ro(e.shop_id,e.repair_order_id::text,'read')
 when e.event_type='stock_low' then exists(select 1 from shop_inventory_items where id=e.source_record_id and shop_id=e.shop_id)
 when e.event_type='payment_recorded' then exists(select 1 from shop_invoice_payments p join shop_invoices i on i.id=p.invoice_id and i.shop_id=p.shop_id where p.id=e.source_record_id and p.shop_id=e.shop_id)
 when e.event_type='pto_requested' then exists(select 1 from shop_requests where id=e.source_record_id and shop_id=e.shop_id and request_type='pto')
 when e.event_type='team_document_shared' then exists(select 1 from shop_team_documents d where d.id=e.source_record_id and d.shop_id=e.shop_id and d.archived_at is null
 and ((d.visible_to_subject and d.subject_user_id=auth.uid()) or (public.has_shop_role(e.shop_id,array['owner','admin']) and public.shop_has_permission(e.shop_id,'team_documents.manage'))))
 else false end
$$;
create or replace function public.deliver_shop_operational_alert(s uuid,k text,src uuid,ref uuid,t text,targets uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare eid uuid;
begin
 insert into shop_alert_events(shop_id,event_type,source_id,source_record_id,title) values(s,k,src,ref,t)
 on conflict(shop_id,event_type,source_id) do nothing returning id into eid;
 if eid is null then return; end if;
 insert into shop_alert_inbox(event_id,user_id)
 select distinct eid,m.user_id from shop_members m
 left join shop_alert_rules r on r.shop_id=s and r.event_type=k
 left join shop_alert_preferences p on p.shop_id=s and p.user_id=m.user_id and p.event_type=k
 where m.shop_id=s and m.is_active and m.role in ('owner','admin','service_writer','technician')
 and m.user_id=any(targets) and coalesce(r.enabled,true)
 and (coalesce(r.required,false) or coalesce(p.enabled,true)) on conflict do nothing;
end $$;
create or replace function public.refresh_shop_stock_alert(s uuid,item uuid) returns void
language plpgsql security definer set search_path=public as $$
declare i public.shop_inventory_items; state public.shop_stock_alert_state; available numeric; low boolean; episode uuid;
begin
 select * into i from shop_inventory_items where id=item and shop_id=s for update;
 if not found then return; end if;
 select c.available into available from public.shop_stock_counts(s,item)c;
 low:=not i.archived and available<=i.reorder_point;
 select * into state from shop_stock_alert_state where item_id=item for update;
 if not found then
  insert into shop_stock_alert_state values(s,item,low,null); return;
 end if;
 if low and not state.is_low then
  episode:=gen_random_uuid();
  perform public.deliver_shop_operational_alert(s,'stock_low',episode,item,
   'Low available stock: '||i.part_number,
   array(select user_id from shop_members where shop_id=s and is_active and role in ('owner','admin','service_writer')));
  update shop_stock_alert_state set is_low=true,episode_id=episode where item_id=item;
 elsif not low and state.is_low then
  update shop_alert_events set resolved_at=now() where shop_id=s and event_type='stock_low' and source_id=state.episode_id;
  update shop_stock_alert_state set is_low=false,episode_id=null where item_id=item;
 end if;
end $$;
create or replace function public.notify_shop_stock_alert() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='shop_inventory_items' then perform public.refresh_shop_stock_alert(new.shop_id,new.id);
 else perform public.refresh_shop_stock_alert(new.shop_id,new.item_id); end if;
 return new;
end $$;
drop trigger if exists notify_low_stock on public.shop_inventory_items;
create trigger notify_low_stock after insert or update of reorder_point,archived on public.shop_inventory_items
for each row execute function public.notify_shop_stock_alert();
drop trigger if exists notify_low_stock on public.shop_inventory_movements;
create trigger notify_low_stock after insert on public.shop_inventory_movements for each row execute function public.notify_shop_stock_alert();
drop trigger if exists notify_low_stock on public.shop_ro_stock_events;
create trigger notify_low_stock after insert on public.shop_ro_stock_events for each row execute function public.notify_shop_stock_alert();
create or replace function public.notify_shop_recorded_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.restored_from_backup or new.method='legacy' then return new; end if;
 if new.reverses_id is not null then
  update shop_alert_events set resolved_at=coalesce(resolved_at,now()) where shop_id=new.shop_id and event_type='payment_recorded' and source_record_id=new.reverses_id; return new;
 end if;
 if new.amount<=0 then return new; end if;
 perform public.deliver_shop_operational_alert(new.shop_id,'payment_recorded',new.id,new.id,'Invoice payment recorded',
 array(select user_id from shop_members where shop_id=new.shop_id and is_active and role in ('owner','admin','service_writer')));
 return new;
end $$;
drop trigger if exists notify_personal_payment on public.shop_invoice_payments;
create trigger notify_personal_payment after insert on public.shop_invoice_payments for each row execute function public.notify_shop_recorded_payment();
create or replace function public.notify_shop_shared_document() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.archived_at is not null or not new.visible_to_subject then return new; end if;
 if tg_op='UPDATE' and old.visible_to_subject and old.subject_user_id=new.subject_user_id then return new; end if;
 -- A document is announced once; hiding/re-sharing it does not resend the alert.
 perform public.deliver_shop_operational_alert(new.shop_id,'team_document_shared',new.id,new.id,'A team document was shared with you',array[new.subject_user_id]);
 return new;
end $$;
drop trigger if exists notify_personal_team_document on public.shop_team_documents;
create trigger notify_personal_team_document after insert or update of visible_to_subject on public.shop_team_documents
for each row execute function public.notify_shop_shared_document();
create or replace function public.notify_shop_pto_request() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.request_type<>'pto' or new.status<>'pending' then return new; end if;
 perform public.deliver_shop_operational_alert(new.shop_id,'pto_requested',new.id,new.id,'New PTO request awaiting review',
 array(select user_id from shop_members where shop_id=new.shop_id and is_active and role in ('owner','admin','service_writer')));
 return new;
end $$;
drop trigger if exists notify_personal_pto on public.shop_requests;
create trigger notify_personal_pto after insert on public.shop_requests for each row execute function public.notify_shop_pto_request();
create or replace function public.resolve_shop_pto_alert() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status in ('approved','declined') then update shop_alert_events set resolved_at=coalesce(resolved_at,now()) where shop_id=new.shop_id and event_type='pto_requested' and source_id=new.id; end if; return new;
end $$;
drop trigger if exists resolve_personal_pto on public.shop_requests;
create trigger resolve_personal_pto after update of status on public.shop_requests for each row execute function public.resolve_shop_pto_alert();
create or replace function public.list_my_shop_alerts(p_shop uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_member(p_shop) then raise exception 'Shop alerts unavailable'; end if;
 return jsonb_build_object('unread',(select count(*) from shop_alert_inbox i join shop_alert_events e on e.id=i.event_id
 where i.user_id=auth.uid() and e.shop_id=p_shop and i.read_at is null and e.resolved_at is null and public.shop_alert_visible(e)),
 'items',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from (
 select e.id,e.event_type,e.repair_order_id,e.title,e.created_at,i.read_at,e.source_record_id,e.resolved_at,
 case when e.event_type='payment_recorded' then (select p.invoice_id from shop_invoice_payments p where p.id=e.source_record_id and p.shop_id=e.shop_id) end as invoice_id
 from shop_alert_events e join shop_alert_inbox i on i.event_id=e.id and i.user_id=auth.uid()
 where e.shop_id=p_shop and public.shop_alert_visible(e) order by e.created_at desc,e.id limit 100)a),'[]'::jsonb));
end $$;
create or replace function public.read_my_shop_alert(p_shop uuid,p_event uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_member(p_shop) then raise exception 'Shop alerts unavailable'; end if;
 update shop_alert_inbox i set read_at=coalesce(i.read_at,now()) from shop_alert_events e
 where i.event_id=e.id and i.user_id=auth.uid() and e.id=p_event and e.shop_id=p_shop and public.shop_alert_visible(e);
 if not found then raise exception 'Alert unavailable'; end if;
end $$;
create or replace function public.my_shop_alert_preferences(p_shop uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_member(p_shop) then raise exception 'Shop alerts unavailable'; end if;
 return (select jsonb_agg(jsonb_build_object('event_type',k,'enabled',coalesce(p.enabled,true),
 'available',coalesce(r.enabled,true),'required',coalesce(r.required,false)))
 from unnest(array['ro_assigned','estimate_approved','stock_low','payment_recorded','team_document_shared','pto_requested']) k
 left join shop_alert_preferences p on p.shop_id=p_shop and p.user_id=auth.uid() and p.event_type=k
 left join shop_alert_rules r on r.shop_id=p_shop and r.event_type=k where public.shop_alert_type_allowed(p_shop,k));
end $$;
create or replace function public.save_my_shop_alert_preference(p_shop uuid,p_type text,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_type_allowed(p_shop,p_type) then raise exception 'Alert preference unavailable'; end if;
 if exists(select 1 from shop_alert_rules where shop_id=p_shop and event_type=p_type and (not enabled or required)) then
 raise exception 'This preference is controlled by your shop'; end if;
 insert into shop_alert_preferences values(p_shop,auth.uid(),p_type,p_enabled)
 on conflict(shop_id,user_id,event_type) do update set enabled=excluded.enabled;
end $$;
revoke all on function public.shop_alert_type_allowed(uuid,text),public.deliver_shop_operational_alert(uuid,text,uuid,uuid,text,uuid[]),public.refresh_shop_stock_alert(uuid,uuid),public.notify_shop_stock_alert(),public.notify_shop_recorded_payment(),public.notify_shop_shared_document(),public.notify_shop_pto_request(),public.resolve_shop_pto_alert() from public,anon,authenticated;
commit;
