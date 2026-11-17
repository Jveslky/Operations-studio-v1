begin;
alter table public.shop_inventory_items add column if not exists category text
 check (category is null or (length(category) between 1 and 80 and category=btrim(category)));

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
  insert into public.shop_inventory_items(shop_id,part_number,manufacturer,description,stock_unit,location,sale_price,reorder_point,archived,created_by,category)
  values(p_shop,trim(p_values->>'part_number'),trim(coalesce(p_values->>'manufacturer','')),trim(p_values->>'description'),trim(coalesce(p_values->>'stock_unit','each')),trim(coalesce(p_values->>'location','')),
   coalesce((p_values->>'sale_price')::numeric,0),coalesce((p_values->>'reorder_point')::numeric,0),coalesce((p_values->>'archived')::boolean,false),auth.uid(),nullif(btrim(p_values->>'category'),'')) returning * into item;
 else
  update public.shop_inventory_items set part_number=trim(p_values->>'part_number'),manufacturer=trim(coalesce(p_values->>'manufacturer','')),description=trim(p_values->>'description'),stock_unit=trim(coalesce(p_values->>'stock_unit','each')),
   location=trim(coalesce(p_values->>'location','')),sale_price=coalesce((p_values->>'sale_price')::numeric,0),reorder_point=coalesce((p_values->>'reorder_point')::numeric,0),archived=coalesce((p_values->>'archived')::boolean,false),category=case when p_values?'category' then nullif(btrim(p_values->>'category'),'') else previous.category end,updated_at=clock_timestamp()
  where id=p_id and shop_id=p_shop returning * into item;
 end if;
 result:=jsonb_build_object('item',to_jsonb(item),'before',case when previous.id is null then null else to_jsonb(previous) end);
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into public.shop_inventory_operations(shop_id,request_id,kind,payload,result,recorded_by,recorded_by_email) values(p_shop,p_request,'item',payload,result,auth.uid(),coalesce(actor,''));
 return result;
end $$;

create or replace function public.shop_inventory_category_directory(p_shop uuid,p_search text default '',p_filter text default 'active',p_page integer default 0,p_size integer default 25,p_category text default null)
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
   and (p_category is null or lower(coalesce(category,''))=lower(p_category))
   and (p_filter<>'low' or available<=reorder_point)
   and (p_search='' or strpos(lower(part_number||' '||manufacturer||' '||description||' '||location),lower(p_search))>0)
 ), page_rows as (select * from filtered order by lower(part_number),id limit p_size offset p_page*p_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by lower(p.part_number),p.id) from page_rows p),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.category nulls last) from (
   select min(category) category,count(*) item_count,count(*) filter(where available<=reorder_point) low_count
   from stock where not archived group by lower(category)
  ) c where p_category is null and p_filter='active' and p_search=''),'[]'::jsonb),
  'count',(select count(*) from filtered),'can_receive',public.shop_inventory_can(p_shop,'receive'),'can_manage',public.shop_inventory_can(p_shop,'manage')) into result;
 return result;
end $$;

revoke all on function public.shop_inventory_category_directory(uuid,text,text,integer,integer,text) from public,anon;
grant execute on function public.shop_inventory_category_directory(uuid,text,text,integer,integer,text) to authenticated;
commit;
