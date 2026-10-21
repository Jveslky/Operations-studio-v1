-- Test first. Requires live-qa-assignment-access.sql and shop-estimate-approvals.sql.
begin;
create table if not exists public.shop_alert_rules (
 shop_id uuid not null references public.shops(id),
 event_type text not null check(event_type in ('ro_assigned','estimate_approved')),
 enabled boolean not null default true, required boolean not null default false,
 primary key(shop_id,event_type)
);
create table if not exists public.shop_alert_preferences (
 shop_id uuid not null references public.shops(id), user_id uuid not null references auth.users(id),
 event_type text not null check(event_type in ('ro_assigned','estimate_approved')),
 enabled boolean not null default true, primary key(shop_id,user_id,event_type)
);
create table if not exists public.shop_alert_events (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 event_type text not null check(event_type in ('ro_assigned','estimate_approved')),
 source_id uuid not null, repair_order_id uuid not null references public.shop_repair_orders(id),
 title text not null, created_at timestamptz not null default now(),
 unique(shop_id,event_type,source_id)
);
create table if not exists public.shop_alert_inbox (
 event_id uuid not null references public.shop_alert_events(id),
 user_id uuid not null references auth.users(id), read_at timestamptz,
 primary key(event_id,user_id)
);
create index if not exists shop_alert_inbox_user_idx on public.shop_alert_inbox(user_id,event_id);
create index if not exists shop_alert_events_recent_idx on public.shop_alert_events(shop_id,created_at desc,id);
alter table public.shop_alert_rules enable row level security;
alter table public.shop_alert_preferences enable row level security;
alter table public.shop_alert_events enable row level security;
alter table public.shop_alert_inbox enable row level security;
-- All access goes through bounded RPCs. No client may manufacture workflow events or recipients.
revoke all on public.shop_alert_rules,public.shop_alert_preferences,public.shop_alert_events,public.shop_alert_inbox from anon,authenticated;

create or replace function public.shop_alert_member(s uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from shop_members where shop_id=s and user_id=auth.uid() and is_active
 and role in ('owner','admin','service_writer','technician'))
 and public.shop_has_permission(s,'repair_orders.read')
$$;
create or replace function public.shop_alert_visible(e public.shop_alert_events) returns boolean
language sql stable security definer set search_path=public as $$
 select public.shop_alert_member(e.shop_id) and exists(
 select 1 from shop_repair_orders r join shop_members m on m.shop_id=r.shop_id and m.user_id=auth.uid() and m.is_active
 where r.id=e.repair_order_id and r.shop_id=e.shop_id
 and (m.role in ('owner','admin','service_writer') or auth.uid() in(r.technician_user_id,r.additional_technician_user_id)))
 and public.shop_can_access_ro(e.shop_id,e.repair_order_id::text,'read')
$$;
create or replace function public.deliver_shop_alert(s uuid,k text,src uuid,ro uuid,t text,targets uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare eid uuid;
begin
 insert into shop_alert_events(shop_id,event_type,source_id,repair_order_id,title) values(s,k,src,ro,t)
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
create or replace function public.notify_shop_ro_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare targets uuid[]; previous uuid[] := array[]::uuid[];
begin
 if tg_op='UPDATE' then previous:=array_remove(array[old.technician_user_id,old.additional_technician_user_id],null); end if;
 select array_agg(distinct x) into targets from unnest(array[new.technician_user_id,new.additional_technician_user_id]) x
 where x is not null and not(x=any(previous));
 if cardinality(targets)>0 then
 perform public.deliver_shop_alert(new.shop_id,'ro_assigned',gen_random_uuid(),new.id,
 'Assigned to RO #'||coalesce(new.ro_number::text,new.id::text),targets);
 end if;
 return new;
end $$;
drop trigger if exists notify_personal_ro_assignment on public.shop_repair_orders;
create trigger notify_personal_ro_assignment after insert or update of technician_user_id,additional_technician_user_id on public.shop_repair_orders
for each row execute function public.notify_shop_ro_assignment();
create or replace function public.notify_shop_estimate_approval() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.shop_repair_orders;
begin
 select * into strict r from shop_repair_orders where id=new.repair_order_id and shop_id=new.shop_id;
 perform public.deliver_shop_alert(new.shop_id,'estimate_approved',new.id,r.id,
 'Estimate authorization recorded for RO #'||coalesce(r.ro_number::text,r.id::text),
 array_remove(array[r.technician_user_id,r.additional_technician_user_id],null));
 return new;
end $$;
drop trigger if exists notify_personal_estimate_approval on public.shop_estimate_approvals;
create trigger notify_personal_estimate_approval after insert on public.shop_estimate_approvals
for each row execute function public.notify_shop_estimate_approval();

create or replace function public.list_my_shop_alerts(p_shop uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_member(p_shop) then raise exception 'Shop alerts unavailable'; end if;
 return jsonb_build_object('unread',(select count(*) from shop_alert_inbox i join shop_alert_events e on e.id=i.event_id
 where i.user_id=auth.uid() and e.shop_id=p_shop and i.read_at is null and public.shop_alert_visible(e)),
 'items',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from (
 select e.id,e.event_type,e.repair_order_id,e.title,e.created_at,i.read_at
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
 from unnest(array['ro_assigned','estimate_approved']) k
 left join shop_alert_preferences p on p.shop_id=p_shop and p.user_id=auth.uid() and p.event_type=k
 left join shop_alert_rules r on r.shop_id=p_shop and r.event_type=k);
end $$;
create or replace function public.save_my_shop_alert_preference(p_shop uuid,p_type text,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.shop_alert_member(p_shop) then raise exception 'Shop alerts unavailable'; end if;
 if exists(select 1 from shop_alert_rules where shop_id=p_shop and event_type=p_type and (not enabled or required)) then
 raise exception 'This preference is controlled by your shop'; end if;
 insert into shop_alert_preferences values(p_shop,auth.uid(),p_type,p_enabled)
 on conflict(shop_id,user_id,event_type) do update set enabled=excluded.enabled;
end $$;
create or replace function public.save_shop_alert_rule(p_shop uuid,p_type text,p_enabled boolean,p_required boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.has_shop_role(p_shop,array['owner','admin']) or not public.shop_has_permission(p_shop,'settings.manage') then
 raise exception 'Shop alert settings unavailable'; end if;
 insert into shop_alert_rules values(p_shop,p_type,p_enabled,p_required)
 on conflict(shop_id,event_type) do update set enabled=excluded.enabled,required=excluded.required;
end $$;
revoke all on function public.shop_alert_member(uuid),public.shop_alert_visible(public.shop_alert_events),public.deliver_shop_alert(uuid,text,uuid,uuid,text,uuid[]),public.notify_shop_ro_assignment(),public.notify_shop_estimate_approval(),public.list_my_shop_alerts(uuid),public.read_my_shop_alert(uuid,uuid),public.my_shop_alert_preferences(uuid),public.save_my_shop_alert_preference(uuid,text,boolean),public.save_shop_alert_rule(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.list_my_shop_alerts(uuid),public.read_my_shop_alert(uuid,uuid),public.my_shop_alert_preferences(uuid),public.save_my_shop_alert_preference(uuid,text,boolean),public.save_shop_alert_rule(uuid,text,boolean,boolean) to authenticated;
commit;
