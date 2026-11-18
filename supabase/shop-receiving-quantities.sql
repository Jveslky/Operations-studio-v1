-- Test-first display aggregate. Recorded receipts and stock are unchanged.
begin;
create or replace function public.shop_receiving_directory(p_shop uuid,p_search text default '',p_supplier text default '',p_from timestamptz default null,p_until timestamptz default null,p_page integer default 0,p_size integer default 25)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb; vendors jsonb; term text:=lower(btrim(coalesce(p_search,''))); size integer:=least(50,greatest(1,coalesce(p_size,25))); offset_rows integer:=least(100000,greatest(0,coalesce(p_page,0)))*size;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Inventory read access is required.';end if;
 if length(term)>200 then raise exception 'Search is too long.';end if;
 with matches as (
  select r.* from shop_inventory_receipts r where r.shop_id=p_shop
   and (coalesce(p_supplier,'')='' or lower(btrim(r.supplier))=lower(btrim(p_supplier)))
   and (p_from is null or r.recorded_at>=p_from) and (p_until is null or r.recorded_at<p_until)
   and (term='' or strpos(lower(r.supplier),term)>0 or strpos(lower(r.invoice_reference),term)>0 or strpos(lower(r.delivery_reference),term)>0 or strpos(lower(r.purchase_order),term)>0
    or exists(select 1 from shop_inventory_movements m join shop_inventory_items i on i.shop_id=m.shop_id and i.id=m.item_id
      where m.shop_id=p_shop and m.receipt_id=r.id and m.kind='receipt' and (strpos(lower(i.part_number),term)>0 or strpos(lower(i.description),term)>0 or strpos(lower(i.manufacturer),term)>0)))
 ), page_rows as (
  select r.*, (select count(*) from shop_inventory_movements m where m.shop_id=p_shop and m.receipt_id=r.id and m.kind='receipt') as line_count,
   (select coalesce(sum(m.quantity),0) from shop_inventory_movements m where m.shop_id=p_shop and m.receipt_id=r.id and m.kind='receipt') as quantity_received,
   (select coalesce(sum(m.quantity*m.unit_cost),0) from shop_inventory_movements m where m.shop_id=p_shop and m.receipt_id=r.id and m.kind='receipt') as receipt_cost
  from matches r order by r.recorded_at desc,r.id desc limit size offset offset_rows
 )
 select jsonb_build_object('count',(select count(*) from matches),'rows',coalesce(jsonb_agg(to_jsonb(page_rows) order by recorded_at desc,id desc),'[]'::jsonb)) into result from page_rows;
 select coalesce(jsonb_agg(to_jsonb(v) order by v.supplier_key),'[]'::jsonb) into vendors from (
  select lower(btrim(supplier)) as supplier_key,min(btrim(supplier)) as supplier,count(*) as receipt_count,max(recorded_at) as last_received
  from shop_inventory_receipts where shop_id=p_shop group by lower(btrim(supplier))
 ) v;
 return result||jsonb_build_object('vendors',vendors);
end $$;
revoke all on function public.shop_receiving_directory(uuid,text,text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.shop_receiving_directory(uuid,text,text,timestamptz,timestamptz,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
