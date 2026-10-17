-- Inventory foundation. Apply after auth-and-membership.sql and shop-user-permissions.sql.
-- No stock is inferred from existing AP bills, invoices or repair orders.
begin;
create table if not exists public.shop_inventory_items (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 part_number text not null check(length(trim(part_number)) between 1 and 100),
 manufacturer text not null default '' check(length(manufacturer)<=120),
 description text not null check(length(trim(description)) between 1 and 500),
 stock_unit text not null default 'each' check(length(trim(stock_unit)) between 1 and 30),
 location text not null default '' check(length(location)<=100),
 sale_price numeric(12,2) not null default 0 check(sale_price>=0),
 reorder_point numeric(14,3) not null default 0 check(reorder_point>=0),
 archived boolean not null default false, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(shop_id,id)
);
create unique index if not exists shop_inventory_part_identity on public.shop_inventory_items(shop_id,lower(trim(manufacturer)),lower(trim(part_number)));
create index if not exists shop_inventory_items_directory on public.shop_inventory_items(shop_id,archived,part_number);
create table if not exists public.shop_inventory_receipts (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 supplier text not null check(length(trim(supplier)) between 1 and 200),
 invoice_reference text not null check(length(trim(invoice_reference)) between 1 and 150),
 delivery_reference text not null check(length(trim(delivery_reference)) between 1 and 150),
 notes text not null default '' check(length(notes)<=2000),
 recorded_by uuid not null references auth.users(id), recorded_by_email text not null, recorded_at timestamptz not null default now(),
 unique(shop_id,id)
);
-- Partial deliveries use separate delivery references; rescanning the same delivery cannot repost stock.
create unique index if not exists shop_inventory_receipt_identity on public.shop_inventory_receipts
 (shop_id,lower(trim(supplier)),lower(trim(invoice_reference)),lower(trim(delivery_reference)));
create table if not exists public.shop_inventory_operations (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 request_id uuid not null, kind text not null check(kind in ('item','receipt','adjustment')),
 payload jsonb not null, result jsonb not null, recorded_by uuid not null references auth.users(id),
 recorded_by_email text not null, recorded_at timestamptz not null default now(), unique(shop_id,request_id), unique(shop_id,id)
);
create table if not exists public.shop_inventory_movements (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 item_id uuid not null, receipt_id uuid, operation_id uuid not null,
 kind text not null check(kind in ('receipt','adjustment')), quantity numeric(14,3) not null check(quantity<>0),
 unit_cost numeric(14,4) check(unit_cost>=0), reason text not null check(length(trim(reason)) between 1 and 2000),
 recorded_by uuid not null references auth.users(id), recorded_by_email text not null, recorded_at timestamptz not null default now(),
 foreign key(shop_id,item_id) references public.shop_inventory_items(shop_id,id),
 foreign key(shop_id,receipt_id) references public.shop_inventory_receipts(shop_id,id),
 foreign key(shop_id,operation_id) references public.shop_inventory_operations(shop_id,id),
 check((kind='receipt' and quantity>0 and unit_cost is not null and receipt_id is not null) or (kind='adjustment' and receipt_id is null)),
 unique(operation_id,item_id)
);
create index if not exists shop_inventory_movements_history on public.shop_inventory_movements(shop_id,item_id,recorded_at desc,id);

create or replace function public.shop_inventory_can(p_shop uuid,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null
 and public.has_shop_role(p_shop,array['owner','admin','service_writer'])
 and public.shop_has_permission(p_shop,'expenses.read')
 and case p_action when 'read' then true when 'receive' then public.shop_has_permission(p_shop,'expenses.write')
 when 'manage' then public.has_shop_role(p_shop,array['owner','admin']) and public.shop_has_permission(p_shop,'settings.manage') and public.shop_has_permission(p_shop,'expenses.write') else false end;
$$;
revoke all on function public.shop_inventory_can(uuid,text) from public,anon;
grant execute on function public.shop_inventory_can(uuid,text) to authenticated;

alter table public.shop_inventory_items enable row level security;
alter table public.shop_inventory_receipts enable row level security;
alter table public.shop_inventory_operations enable row level security;
alter table public.shop_inventory_movements enable row level security;
revoke all on public.shop_inventory_items,public.shop_inventory_receipts,public.shop_inventory_operations,public.shop_inventory_movements from anon,authenticated;
grant select on public.shop_inventory_items,public.shop_inventory_receipts,public.shop_inventory_operations,public.shop_inventory_movements to authenticated;
drop policy if exists inventory_read on public.shop_inventory_items;
create policy inventory_read on public.shop_inventory_items for select to authenticated using(public.shop_inventory_can(shop_id,'read'));
drop policy if exists inventory_read on public.shop_inventory_receipts;
create policy inventory_read on public.shop_inventory_receipts for select to authenticated using(public.shop_inventory_can(shop_id,'read'));
drop policy if exists inventory_read on public.shop_inventory_operations;
create policy inventory_read on public.shop_inventory_operations for select to authenticated using(public.shop_inventory_can(shop_id,'read'));
drop policy if exists inventory_read on public.shop_inventory_movements;
create policy inventory_read on public.shop_inventory_movements for select to authenticated using(public.shop_inventory_can(shop_id,'read'));

create or replace function public.immutable_shop_inventory() returns trigger language plpgsql as $$
begin raise exception 'Inventory history is immutable. Record a reasoned correction instead.';end $$;
drop trigger if exists inventory_immutable on public.shop_inventory_receipts;
create trigger inventory_immutable before update or delete on public.shop_inventory_receipts for each row execute function public.immutable_shop_inventory();
drop trigger if exists inventory_immutable on public.shop_inventory_operations;
create trigger inventory_immutable before update or delete on public.shop_inventory_operations for each row execute function public.immutable_shop_inventory();
drop trigger if exists inventory_immutable on public.shop_inventory_movements;
create trigger inventory_immutable before update or delete on public.shop_inventory_movements for each row execute function public.immutable_shop_inventory();

-- Callers check permissions before this helper. Serialize same-key retries, and
-- reject changed payloads rather than silently returning an unrelated success.
create or replace function public.shop_inventory_replay(p_shop uuid,p_request uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.shop_inventory_operations;
begin
 if p_request is null then raise exception 'A request ID is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_shop::text||':'||p_request::text,0));
 select * into previous from public.shop_inventory_operations where shop_id=p_shop and request_id=p_request;
 if previous.id is not null then
  if previous.kind<>p_kind or previous.payload is distinct from p_payload or previous.recorded_by<>auth.uid() then raise exception 'This request was already used with different details.';end if;
  return previous.result;
 end if;return null;
end $$;
revoke all on function public.shop_inventory_replay(uuid,uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.save_shop_inventory_item(p_shop uuid,p_request uuid,p_id uuid,p_expected timestamptz,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.shop_inventory_items; item public.shop_inventory_items; payload jsonb; result jsonb; actor text;
begin
 if not public.shop_inventory_can(p_shop,'manage') then raise exception 'Owner/admin inventory management access is required.';end if;
 payload:=jsonb_build_object('id',p_id,'expected',p_expected,'values',p_values);
 result:=public.shop_inventory_replay(p_shop,p_request,'item',payload);if result is not null then return result;end if;
 if jsonb_typeof(p_values) is distinct from 'object' or coalesce(p_values->>'sale_price','0') !~ '^[0-9]+([.][0-9]{1,2})?$'
 or coalesce(p_values->>'reorder_point','0') !~ '^[0-9]+([.][0-9]{1,3})?$' then raise exception 'Use nonnegative prices (2 decimals) and quantities (3 decimals).';end if;
 if p_id is not null then
  select * into previous from public.shop_inventory_items where shop_id=p_shop and id=p_id for update;
  if previous.id is null or previous.updated_at is distinct from p_expected then raise exception 'Part changed or is unavailable. Refresh before editing.';end if;
  if coalesce(p_values->>'stock_unit','each')<>previous.stock_unit and exists(select 1 from public.shop_inventory_movements where item_id=p_id and shop_id=p_shop) then raise exception 'Stock units cannot change after a movement. Create a separate part instead.';end if;
 end if;
 if p_id is null then
  insert into public.shop_inventory_items(shop_id,part_number,manufacturer,description,stock_unit,location,sale_price,reorder_point,archived,created_by)
  values(p_shop,trim(p_values->>'part_number'),trim(coalesce(p_values->>'manufacturer','')),trim(p_values->>'description'),trim(coalesce(p_values->>'stock_unit','each')),trim(coalesce(p_values->>'location','')),
   coalesce((p_values->>'sale_price')::numeric,0),coalesce((p_values->>'reorder_point')::numeric,0),coalesce((p_values->>'archived')::boolean,false),auth.uid()) returning * into item;
 else
  update public.shop_inventory_items set part_number=trim(p_values->>'part_number'),manufacturer=trim(coalesce(p_values->>'manufacturer','')),description=trim(p_values->>'description'),stock_unit=trim(coalesce(p_values->>'stock_unit','each')),
   location=trim(coalesce(p_values->>'location','')),sale_price=coalesce((p_values->>'sale_price')::numeric,0),reorder_point=coalesce((p_values->>'reorder_point')::numeric,0),archived=coalesce((p_values->>'archived')::boolean,false),updated_at=clock_timestamp()
  where id=p_id and shop_id=p_shop returning * into item;
 end if;
 result:=jsonb_build_object('item',to_jsonb(item),'before',case when previous.id is null then null else to_jsonb(previous) end);
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into public.shop_inventory_operations(shop_id,request_id,kind,payload,result,recorded_by,recorded_by_email) values(p_shop,p_request,'item',payload,result,auth.uid(),coalesce(actor,''));
 return result;
end $$;

create or replace function public.receive_shop_inventory(p_shop uuid,p_request uuid,p_receipt jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payload jsonb; result jsonb; receipt public.shop_inventory_receipts; item public.shop_inventory_items; line jsonb; actor text; op uuid:=gen_random_uuid();
begin
 if not public.shop_inventory_can(p_shop,'receive') then raise exception 'Inventory receiving access is required.';end if;
 payload:=jsonb_build_object('receipt',p_receipt,'lines',p_lines);
 result:=public.shop_inventory_replay(p_shop,p_request,'receipt',payload);if result is not null then return result;end if;
 if jsonb_typeof(p_receipt) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Receipt details and part lines are required.';end if;
 if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Receive between 1 and 100 part lines.';end if;
 if (select count(distinct v->>'item_id') from jsonb_array_elements(p_lines) v)<>jsonb_array_length(p_lines) then raise exception 'Each part must appear once per receipt. Combine its received quantities.';end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into public.shop_inventory_receipts(shop_id,supplier,invoice_reference,delivery_reference,notes,recorded_by,recorded_by_email)
 values(p_shop,trim(p_receipt->>'supplier'),trim(p_receipt->>'invoice_reference'),trim(p_receipt->>'delivery_reference'),coalesce(p_receipt->>'notes',''),auth.uid(),coalesce(actor,'')) returning * into receipt;
 result:=jsonb_build_object('receipt',to_jsonb(receipt),'line_count',jsonb_array_length(p_lines));
 insert into public.shop_inventory_operations(id,shop_id,request_id,kind,payload,result,recorded_by,recorded_by_email) values(op,p_shop,p_request,'receipt',payload,result,auth.uid(),coalesce(actor,''));
 -- Stable lock order protects simultaneous multi-part deliveries and corrections.
 for line in select v from jsonb_array_elements(p_lines) v order by v->>'item_id' loop
  if coalesce(line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$' or coalesce(line->>'unit_cost','') !~ '^[0-9]+([.][0-9]{1,4})?$' or (line->>'quantity')::numeric<=0 then raise exception 'Received quantities must be positive (3 decimals); unit costs nonnegative (4 decimals).';end if;
  select * into item from public.shop_inventory_items where id=(line->>'item_id')::uuid and shop_id=p_shop and not archived for update;
  if item.id is null then raise exception 'A received part is unavailable or archived.';end if;
  insert into public.shop_inventory_movements(shop_id,item_id,receipt_id,operation_id,kind,quantity,unit_cost,reason,recorded_by,recorded_by_email)
  values(p_shop,item.id,receipt.id,op,'receipt',(line->>'quantity')::numeric,(line->>'unit_cost')::numeric,'Confirmed delivery '||receipt.delivery_reference,auth.uid(),coalesce(actor,''));
 end loop;
 return result;
end $$;

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
 select coalesce(sum(quantity),0) into stock from public.shop_inventory_movements where shop_id=p_shop and item_id=p_item;
 if stock<>p_expected then raise exception 'Stock changed. Refresh and review the correction.';end if;
 if stock+p_quantity<0 then raise exception 'Correction would make stock negative.';end if;
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
  select i.*,coalesce((select sum(m.quantity) from public.shop_inventory_movements m where m.shop_id=p_shop and m.item_id=i.id),0) on_hand,
   (select m.unit_cost from public.shop_inventory_movements m where m.shop_id=p_shop and m.item_id=i.id and m.kind='receipt' order by m.recorded_at desc,m.id desc limit 1) last_unit_cost
  from public.shop_inventory_items i where shop_id=p_shop
 ), filtered as (
  select * from stock where (p_filter='all' or p_filter='archived' and archived or p_filter in ('active','low') and not archived)
   and (p_filter<>'low' or on_hand<=reorder_point)
   and (p_search='' or strpos(lower(part_number||' '||manufacturer||' '||description||' '||location),lower(p_search))>0)
 ), page_rows as (select * from filtered order by lower(part_number),id limit p_size offset p_page*p_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by lower(p.part_number),p.id) from page_rows p),'[]'::jsonb),
  'count',(select count(*) from filtered),'can_receive',public.shop_inventory_can(p_shop,'receive'),'can_manage',public.shop_inventory_can(p_shop,'manage')) into result;
 return result;
end $$;
create or replace function public.shop_inventory_history(p_shop uuid,p_item uuid,p_page integer default 0,p_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Your role cannot open inventory history.';end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size not in (10,25,50) then raise exception 'Invalid history page.';end if;
 if not exists(select 1 from public.shop_inventory_items where id=p_item and shop_id=p_shop) then raise exception 'Part is unavailable.';end if;
 with movements as (
  select m.*,r.supplier,r.invoice_reference,r.delivery_reference from public.shop_inventory_movements m
  left join public.shop_inventory_receipts r on r.id=m.receipt_id and r.shop_id=p_shop where m.shop_id=p_shop and m.item_id=p_item
 ), page_rows as (select * from movements order by recorded_at desc,id desc limit p_size offset p_page*p_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.recorded_at desc,p.id desc) from page_rows p),'[]'::jsonb),'count',(select count(*) from movements)) into result;
 return result;
end $$;

revoke all on function public.save_shop_inventory_item(uuid,uuid,uuid,timestamptz,jsonb),public.receive_shop_inventory(uuid,uuid,jsonb,jsonb),public.adjust_shop_inventory(uuid,uuid,uuid,numeric,numeric,text),public.shop_inventory_directory(uuid,text,text,integer,integer),public.shop_inventory_history(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.save_shop_inventory_item(uuid,uuid,uuid,timestamptz,jsonb),public.receive_shop_inventory(uuid,uuid,jsonb,jsonb),public.adjust_shop_inventory(uuid,uuid,uuid,numeric,numeric,text),public.shop_inventory_directory(uuid,text,text,integer,integer),public.shop_inventory_history(uuid,uuid,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
