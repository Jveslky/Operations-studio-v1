-- Requires inventory foundation, inventory permissions, estimate approvals and ready-payment drafts.
begin;
alter table public.shop_repair_orders add column if not exists estimate_stock_lines jsonb not null default '[]';
alter table public.shop_repair_orders add column if not exists stock_lines_expected jsonb;
create table if not exists public.shop_ro_stock_events (
 id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(id),
 repair_order_id uuid not null references public.shop_repair_orders(id),item_id uuid not null,
 hold_delta numeric(14,3) not null default 0,stock_delta numeric(14,3) not null default 0,
 kind text not null check(kind in ('hold','release','consume','return')),reason text not null,
 request_id uuid not null,recorded_by uuid not null references auth.users(id),recorded_by_email text not null,
 recorded_at timestamptz not null default now(),foreign key(shop_id,item_id) references public.shop_inventory_items(shop_id,id),
 unique(shop_id,request_id,item_id)
);
create index if not exists ro_stock_lookup on public.shop_ro_stock_events(shop_id,item_id);
create table if not exists public.shop_ro_stock_settlements (
 repair_order_id uuid primary key references public.shop_repair_orders(id),shop_id uuid not null references public.shops(id),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now()
);
create table if not exists public.shop_ro_stock_confirmations (
 repair_order_id uuid not null references public.shop_repair_orders(id),user_id uuid not null references auth.users(id),
 lines jsonb not null,recorded_at timestamptz not null default now(),primary key(repair_order_id,user_id)
);
alter table public.shop_ro_stock_events enable row level security;
alter table public.shop_ro_stock_settlements enable row level security;
alter table public.shop_ro_stock_confirmations enable row level security;
revoke all on public.shop_ro_stock_events,public.shop_ro_stock_settlements,public.shop_ro_stock_confirmations from public,anon,authenticated;
grant select on public.shop_ro_stock_events to authenticated;
drop policy if exists stock_events_read on public.shop_ro_stock_events;
create policy stock_events_read on public.shop_ro_stock_events for select to authenticated using(public.shop_inventory_can(shop_id,'read'));
drop trigger if exists immutable_ro_stock_events on public.shop_ro_stock_events;
create trigger immutable_ro_stock_events before update or delete on public.shop_ro_stock_events for each row execute function public.immutable_shop_inventory();
create or replace function public.shop_stock_counts(p_shop uuid,p_item uuid)
returns table(on_hand numeric,on_hold numeric,available numeric) language sql volatile security definer set search_path=public,pg_temp as $$
 select stock,held,stock-held from (
 select coalesce((select sum(quantity) from shop_inventory_movements where shop_id=p_shop and item_id=p_item),0)
 +coalesce((select sum(stock_delta) from shop_ro_stock_events where shop_id=p_shop and item_id=p_item),0) stock,
 coalesce((select sum(hold_delta) from shop_ro_stock_events where shop_id=p_shop and item_id=p_item),0) held) s;
$$;
revoke all on function public.shop_stock_counts(uuid,uuid) from public,anon,authenticated;
create or replace function public.confirm_shop_ro_stock(p_ro uuid,p_lines jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;
begin
 select * into ro from shop_repair_orders where id=p_ro for update;
 if ro.id is null or not public.shop_can_access_ro(ro.shop_id,ro.id::text,'work') then raise exception 'Repair order is unavailable.';end if;
 if ro.estimate_stock_lines is distinct from p_lines then raise exception 'Stock lines changed. Save and review before confirming.';end if;
 insert into shop_ro_stock_confirmations values(p_ro,auth.uid(),p_lines,now()) on conflict(repair_order_id,user_id) do update set lines=excluded.lines,recorded_at=excluded.recorded_at;
end $$;
revoke all on function public.confirm_shop_ro_stock(uuid,jsonb) from public,anon;
grant execute on function public.confirm_shop_ro_stock(uuid,jsonb) to authenticated;
create or replace function public.guard_ro_stock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare line jsonb;item public.shop_inventory_items;oldqty numeric;newqty numeric;delta numeric;counts record;actor text;settled boolean;wanted boolean;ready boolean;key uuid:=gen_random_uuid();
begin
 if jsonb_typeof(new.estimate_stock_lines)<>'array' or jsonb_array_length(new.estimate_stock_lines)>100 then raise exception 'Invalid stocked parts.';end if;
 if tg_op='INSERT' then
  if new.estimate_stock_lines<>'[]'::jsonb then raise exception 'Create the repair order before reserving parts.';end if;
  return new;
 end if;
 if new.estimate_stock_lines is distinct from old.estimate_stock_lines and new.stock_lines_expected is distinct from old.estimate_stock_lines then raise exception 'Stocked lines changed in another session. Refresh and review before saving.';end if;
 new.stock_lines_expected:=null;
 if new.estimate_stock_lines is distinct from old.estimate_stock_lines and new.status in ('Ready for Payment','Ready for Pickup','Complete') then raise exception 'Save stocked line revisions before moving to Ready for Payment.';end if;
 if new.shop_id<>old.shop_id then raise exception 'Repair order shop cannot change.';end if;
 select exists(select 1 from shop_ro_stock_settlements where repair_order_id=new.id) into settled;
 if settled and new.estimate_stock_lines is distinct from old.estimate_stock_lines then raise exception 'Consumed stocked lines are locked. Record a physical return instead.';end if;
 if new.estimate_stock_lines is distinct from old.estimate_stock_lines and (not public.shop_has_permission(new.shop_id,'repair_orders.write') or not public.shop_inventory_can(new.shop_id,'read')) then raise exception 'Office estimate access is required.';end if;
 -- No replenishment or repeat consumption when an RO is reopened.
 if settled then return new;end if;
 if new.estimate_stock_lines is distinct from old.estimate_stock_lines and new.approval_request is not null then raise exception 'Revise the estimate before changing stocked lines; approval must be recorded separately.';end if;
 if exists(select 1 from jsonb_array_elements(new.estimate_stock_lines) x group by x->>'item_id' having count(*)>1) then raise exception 'Combine duplicate stocked part lines.';end if;
 for line in select value from jsonb_array_elements(new.estimate_stock_lines) loop
  if coalesce((line->>'quantity')::numeric,0)<=0 or (line->>'quantity')::numeric<>round((line->>'quantity')::numeric,3)
   or coalesce((line->>'unit_price')::numeric,-1)<0 or (line->>'unit_price')::numeric<>round((line->>'unit_price')::numeric,2) then raise exception 'Invalid stock quantity or price.';end if;
 end loop;
 if coalesce((select sum(round((x->>'quantity')::numeric*(x->>'unit_price')::numeric,2)) from jsonb_array_elements(new.estimate_stock_lines) x),0)>new.estimate_parts_total then raise exception 'Parts total cannot be less than stocked lines.';end if;
 wanted:=not new.archived and new.status not in ('Cancelled','Canceled','Complete') and new.estimate_approval_status<>'Declined';
 ready:=new.status='Ready for Payment' and old.status is distinct from new.status;
 if ready and not wanted and new.estimate_stock_lines<>'[]'::jsonb then raise exception 'Declined or archived stocked work cannot be consumed.';end if;
 if ready and new.estimate_stock_lines<>'[]'::jsonb and not exists(select 1 from shop_ro_stock_confirmations where repair_order_id=new.id and user_id=auth.uid() and lines=new.estimate_stock_lines and recorded_at>now()-interval '5 minutes') then raise exception 'Review and confirm stocked parts before Ready for Payment.';end if;
 if new.status='Complete' and old.status is distinct from new.status and new.estimate_stock_lines<>'[]'::jsonb then raise exception 'Confirm Ready for Payment before completing stocked work.';end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 -- Stable item lock order serializes competing jobs and receiving/corrections.
 for item in select * from shop_inventory_items where shop_id=new.shop_id and id in (
  select (value->>'item_id')::uuid from jsonb_array_elements(new.estimate_stock_lines)
  union select item_id from shop_ro_stock_events where repair_order_id=new.id) order by id for update loop
  select coalesce(sum(hold_delta),0) into oldqty from shop_ro_stock_events where repair_order_id=new.id and item_id=item.id;
  select coalesce(sum((x->>'quantity')::numeric),0) into newqty from jsonb_array_elements(new.estimate_stock_lines) x where (x->>'item_id')::uuid=item.id;
  if not wanted then newqty:=0;end if;
  if exists(select 1 from jsonb_array_elements(new.estimate_stock_lines) x where (x->>'item_id')::uuid=item.id and (x->>'part_number' is distinct from item.part_number or x->>'description' is distinct from item.description or x->>'stock_unit' is distinct from item.stock_unit)) and new.estimate_stock_lines is distinct from old.estimate_stock_lines then raise exception 'Catalog details changed. Select the part again.';end if;
  if item.archived and newqty>oldqty then raise exception 'Part is archived.';end if;
  select * into counts from shop_stock_counts(new.shop_id,item.id);
  delta:=newqty-oldqty;
  if delta>counts.available then raise exception 'Insufficient available stock for %. Available: %; additional hold: %.',item.part_number,counts.available,delta;end if;
  if delta<>0 then insert into shop_ro_stock_events(shop_id,repair_order_id,item_id,hold_delta,kind,reason,request_id,recorded_by,recorded_by_email)
   values(new.shop_id,new.id,item.id,delta,case when delta>0 then 'hold' else 'release' end,'Saved estimate/status allocation',key,auth.uid(),actor);end if;
  if ready and newqty>0 then insert into shop_ro_stock_events(shop_id,repair_order_id,item_id,hold_delta,stock_delta,kind,reason,request_id,recorded_by,recorded_by_email)
   values(new.shop_id,new.id,item.id,-newqty,-newqty,'consume','Confirmed Ready for Payment',gen_random_uuid(),auth.uid(),actor);end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new.estimate_stock_lines) x where not exists(select 1 from shop_inventory_items where shop_id=new.shop_id and id=(x->>'item_id')::uuid)) then raise exception 'Stock part is unavailable in this shop.';end if;
 if ready and new.estimate_stock_lines<>'[]'::jsonb then
  insert into shop_ro_stock_settlements values(new.id,new.shop_id,auth.uid(),now());
  delete from shop_ro_stock_confirmations where repair_order_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists a_inventory_holds on public.shop_repair_orders;
create trigger a_inventory_holds before insert or update on public.shop_repair_orders for each row execute function public.guard_ro_stock();
create or replace function public.adjust_shop_inventory(p_shop uuid,p_request uuid,p_item uuid,p_quantity numeric,p_expected numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payload jsonb; result jsonb; item public.shop_inventory_items; stock numeric; actor text; op uuid:=gen_random_uuid();
begin
 if not public.shop_inventory_can(p_shop,'manage') then raise exception 'Owner/admin inventory management access is required.';end if;
 payload:=jsonb_build_object('item',p_item,'quantity',p_quantity,'expected',p_expected,'reason',p_reason);
 result:=public.shop_inventory_replay(p_shop,p_request,'adjustment',payload);if result is not null then return result;end if;
 if p_quantity is null or p_quantity=0 or abs(p_quantity)>=100000000000 or p_quantity<>round(p_quantity,3) or p_expected is null or p_expected<0
 or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'Enter a nonzero quantity (up to 3 decimals) and a correction reason.';end if;
 select * into item from public.shop_inventory_items where shop_id=p_shop and id=p_item for update;
 if item.id is null then raise exception 'Part is unavailable.';end if;
 select on_hand into stock from public.shop_stock_counts(p_shop,p_item);
 if stock<>p_expected then raise exception 'Stock changed. Refresh and review the correction.';end if;
 if stock+p_quantity<(select on_hold from public.shop_stock_counts(p_shop,p_item)) then raise exception 'Correction would make stock negative or consume held stock.';end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 result:=jsonb_build_object('item_id',p_item,'before',stock,'after',stock+p_quantity,'quantity',p_quantity);
 insert into public.shop_inventory_operations(id,shop_id,request_id,kind,payload,result,recorded_by,recorded_by_email) values(op,p_shop,p_request,'adjustment',payload,result,auth.uid(),coalesce(actor,''));
 insert into public.shop_inventory_movements(shop_id,item_id,operation_id,kind,quantity,reason,recorded_by,recorded_by_email)
 values(p_shop,p_item,op,'adjustment',p_quantity,trim(p_reason),auth.uid(),coalesce(actor,''));
 return result;
end $$;

create or replace function public.shop_inventory_directory(p_shop uuid,p_search text default '',p_filter text default 'active',p_page integer default 0,p_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Your role cannot open inventory.';end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size not in (10,25,50) or p_filter is null or p_filter not in ('active','archived','all','low') or p_search is null or length(p_search)>200 then raise exception 'Invalid inventory filters.';end if;
 with stock as (
  select i.*,c.on_hand,c.on_hold,c.available,
   (select m.unit_cost from public.shop_inventory_movements m where m.shop_id=p_shop and m.item_id=i.id and m.kind='receipt' order by m.recorded_at desc,m.id desc limit 1) last_unit_cost
  from public.shop_inventory_items i cross join lateral public.shop_stock_counts(p_shop,i.id) c where shop_id=p_shop
 ), filtered as (
  select * from stock where (p_filter='all' or p_filter='archived' and archived or p_filter in ('active','low') and not archived)
   and (p_filter<>'low' or available<=reorder_point)
   and (p_search='' or strpos(lower(part_number||' '||manufacturer||' '||description||' '||location),lower(p_search))>0)
 ), page_rows as (select * from filtered order by lower(part_number),id limit p_size offset p_page*p_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by lower(p.part_number),p.id) from page_rows p),'[]'::jsonb),
  'count',(select count(*) from filtered),'can_receive',public.shop_inventory_can(p_shop,'receive'),'can_manage',public.shop_inventory_can(p_shop,'manage')) into result;
 return result;
end $$;

create or replace function public.return_shop_ro_stock(p_ro uuid,p_item uuid,p_quantity numeric,p_reason text,p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;previous public.shop_ro_stock_events;remaining numeric;actor text;
begin
 select * into ro from shop_repair_orders where id=p_ro for update;
 if ro.id is null or not public.shop_inventory_can(ro.shop_id,'manage') then raise exception 'Inventory management access is required.';end if;
 if p_request is null or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,3) or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'Enter a positive return quantity and reason.';end if;
 select * into previous from shop_ro_stock_events where shop_id=ro.shop_id and request_id=p_request and item_id=p_item;
 if previous.id is not null then
  if previous.repair_order_id<>p_ro or previous.kind<>'return' or previous.stock_delta<>p_quantity or previous.reason<>trim(p_reason) or previous.recorded_by<>auth.uid() then raise exception 'Return request already used with different details.';end if;
  return;
 end if;
 perform 1 from shop_inventory_items where shop_id=ro.shop_id and id=p_item for update;
 select -coalesce(sum(stock_delta),0) into remaining from shop_ro_stock_events where repair_order_id=p_ro and item_id=p_item and kind in ('consume','return');
 if p_quantity>remaining then raise exception 'Return exceeds consumed quantity remaining: %.',remaining;end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into shop_ro_stock_events(shop_id,repair_order_id,item_id,stock_delta,kind,reason,request_id,recorded_by,recorded_by_email)
 values(ro.shop_id,p_ro,p_item,p_quantity,'return',trim(p_reason),p_request,auth.uid(),actor);
end $$;
revoke all on function public.return_shop_ro_stock(uuid,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.return_shop_ro_stock(uuid,uuid,numeric,text,uuid) to authenticated;
create or replace function public.shop_inventory_history(p_shop uuid,p_item uuid,p_page integer default 0,p_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Your role cannot open inventory history.';end if;
 if p_page is null or p_page<0 or p_size not in (10,25,50) then raise exception 'Invalid history page.';end if;
 if not exists(select 1 from shop_inventory_items where shop_id=p_shop and id=p_item) then raise exception 'Part is unavailable.';end if;
 with events as (
 select m.id,m.quantity,m.kind,m.unit_cost,m.reason,m.recorded_by,m.recorded_by_email,m.recorded_at,r.supplier,r.invoice_reference,r.delivery_reference
 from shop_inventory_movements m left join shop_inventory_receipts r on r.id=m.receipt_id and r.shop_id=m.shop_id where m.shop_id=p_shop and m.item_id=p_item
 union all
 select e.id,case when e.stock_delta<>0 then e.stock_delta else e.hold_delta end,e.kind,null::numeric,
 'RO #'||ro.ro_number||' · '||e.reason,e.recorded_by,e.recorded_by_email,e.recorded_at,null::text,null::text,null::text
 from shop_ro_stock_events e join shop_repair_orders ro on ro.id=e.repair_order_id and ro.shop_id=e.shop_id where e.shop_id=p_shop and e.item_id=p_item
 ), paged as (select * from events order by recorded_at desc,id desc limit p_size offset p_page*p_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by recorded_at desc,id desc) from paged p),'[]'::jsonb),'count',(select count(*) from events)) into result;
 return result;
end $$;
commit;
