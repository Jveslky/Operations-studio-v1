-- Test-first Receiving workspace. Existing receipt identities and retry payloads are preserved.
begin;
alter table public.shop_inventory_receipts add column if not exists purchase_order text not null default '' check(length(purchase_order)<=150);
create index if not exists shop_inventory_receipts_recent on public.shop_inventory_receipts(shop_id,recorded_at desc,id desc);
create index if not exists shop_inventory_movements_receipt on public.shop_inventory_movements(shop_id,receipt_id);
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
 insert into public.shop_inventory_receipts(shop_id,supplier,invoice_reference,delivery_reference,purchase_order,notes,recorded_by,recorded_by_email)
 values(p_shop,trim(p_receipt->>'supplier'),trim(p_receipt->>'invoice_reference'),trim(p_receipt->>'delivery_reference'),btrim(coalesce(p_receipt->>'purchase_order','')),coalesce(p_receipt->>'notes',''),auth.uid(),coalesce(actor,'')) returning * into receipt;
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

create or replace function public.receive_shop_ap_stock(p_shop uuid,p_request uuid,p_bill uuid,p_expected timestamptz,p_review jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare bill public.shop_accounts_payable; previous public.shop_ap_stock_receipts; row jsonb;
 lines jsonb:='[]'; result jsonb; qty numeric; pack numeric; cost numeric; reason text;
begin
 if not public.shop_inventory_can(p_shop,'receive') or not public.shop_has_permission(p_shop,'expenses.read') then raise exception 'AP and inventory receiving access are required.';end if;
 select * into bill from shop_accounts_payable where id=p_bill and shop_id=p_shop for update;
 if bill.id is null then raise exception 'Supplier bill is unavailable.';end if;
 select * into previous from shop_ap_stock_receipts where shop_id=p_shop and request_id=p_request;
 if previous.id is not null then
  if previous.bill_id<>p_bill or previous.review is distinct from p_review or previous.recorded_by<>auth.uid() then raise exception 'Request already used with different review details.';end if;
  return jsonb_build_object('receipt_id',previous.receipt_id);
 end if;
 if bill.status='void' or bill.updated_at is distinct from p_expected then raise exception 'Supplier bill changed. Reopen and review before receiving.';end if;
 if jsonb_typeof(p_review->'rows') is distinct from 'array' or jsonb_array_length(p_review->'rows') not between 1 and 100
 or p_review->'physical_check' is distinct from 'true'::jsonb or p_review->'source_check' is distinct from 'true'::jsonb
 or coalesce(length(trim(p_review->>'delivery')),0) not between 1 and 200 then raise exception 'Review source, physical delivery, and every part line.';end if;
 if coalesce(length(trim(bill.invoice_number)),0)=0 then raise exception 'An invoice reference is required on the supplier bill.';end if;
 for row in select value from jsonb_array_elements(p_review->'rows') loop
  if coalesce(length(row->>'source'),0)>4000 or coalesce(length(row->>'description'),0)>2000 then raise exception 'Review line is too long.';end if;
  if row->>'action'='skip' then
   if coalesce(length(trim(row->>'reason')),0) not between 1 and 1000 then raise exception 'Explain every excluded line.';end if;
  elsif row->>'action'='receive' then
   if coalesce(row->>'received','') !~ '^[0-9]+([.][0-9]{1,3})?$' or coalesce(row->>'pack','') !~ '^[0-9]+([.][0-9]{1,3})?$'
    or coalesce(row->>'supplier_cost','') !~ '^[0-9]+([.][0-9]{1,4})?$' then raise exception 'Invalid received quantity, pack size or cost.';end if;
   qty:=(row->>'received')::numeric;pack:=(row->>'pack')::numeric;cost:=(row->>'supplier_cost')::numeric;
   if qty<=0 or pack<=0 or qty*pack<>round(qty*pack,3) then raise exception 'Positive physical quantities and pack sizes with valid stock precision are required.';end if;
   if not exists(select 1 from shop_inventory_items where shop_id=p_shop and id=(row->>'item_id')::uuid and not archived) then raise exception 'Matched inventory part is unavailable.';end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('item_id',row->>'item_id','quantity',qty*pack,'unit_cost',round(cost/pack,4)));
  else raise exception 'Choose Receive or Exclude for every line.';
  end if;
 end loop;
 result:=public.receive_shop_inventory(p_shop,p_request,jsonb_build_object('supplier',bill.vendor,'invoice_reference',bill.invoice_number,'delivery_reference',trim(p_review->>'delivery'),'purchase_order',btrim(coalesce(p_review->>'purchase_order','')),'notes','Reviewed AP bill '||bill.id::text),lines);
 insert into shop_ap_stock_receipts(shop_id,bill_id,receipt_id,request_id,review,source_snapshot,recorded_by)
 values(p_shop,p_bill,(result->'receipt'->>'id')::uuid,p_request,p_review,to_jsonb(bill),auth.uid());
 return jsonb_build_object('receipt_id',result->'receipt'->>'id');
end;$$;

-- Invoker rights retain table RLS in addition to explicit inventory permission checks.
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
create or replace function public.shop_receiving_detail(p_shop uuid,p_receipt uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare receipt jsonb; lines jsonb; source jsonb;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Inventory read access is required.';end if;
 select to_jsonb(r) into receipt from shop_inventory_receipts r where r.shop_id=p_shop and r.id=p_receipt;
 if receipt is null then raise exception 'Receipt is unavailable.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'part_number',i.part_number,'description',i.description,'manufacturer',i.manufacturer,'stock_unit',i.stock_unit,'quantity',m.quantity,'unit_cost',m.unit_cost,'line_cost',m.quantity*m.unit_cost) order by i.part_number,i.id),'[]'::jsonb)
 into lines from shop_inventory_movements m join shop_inventory_items i on i.shop_id=m.shop_id and i.id=m.item_id
 where m.shop_id=p_shop and m.receipt_id=p_receipt and m.kind='receipt';
 -- Both link and bill reads retain RLS; inventory-only staff receive no AP link.
 select jsonb_build_object('kind','ap','bill_id',b.id,'invoice_reference',b.invoice_number)
 into source from shop_ap_stock_receipts link join shop_accounts_payable b on b.id=link.bill_id and b.shop_id=link.shop_id
 where link.shop_id=p_shop and link.receipt_id=p_receipt;
 return jsonb_build_object('receipt',receipt,'lines',lines,'source',source);
end $$;
revoke all on function public.shop_receiving_directory(uuid,text,text,timestamptz,timestamptz,integer,integer),public.shop_receiving_detail(uuid,uuid) from public,anon;
grant execute on function public.shop_receiving_directory(uuid,text,text,timestamptz,timestamptz,integer,integer),public.shop_receiving_detail(uuid,uuid) to authenticated;

-- Preserve restoration of signed backups produced before the optional PO field.
do $compat$
declare definition text; anchor text := $anchor$        for item in select value from jsonb_array_elements(cloud->dataset.key)
        loop
$anchor$;
begin
 if to_regprocedure('public.restore_shop_data_backup_v3(uuid,jsonb)') is not null then
  definition := pg_get_functiondef('public.restore_shop_data_backup_v3(uuid,jsonb)'::regprocedure);
  if strpos(definition, 'Receipts predating PO references') = 0 then
   if strpos(definition, anchor) = 0 then raise exception 'Review backup restore compatibility before adding receipt PO references.';end if;
   execute replace(definition, anchor, anchor || $addition$            -- Receipts predating PO references restore with an empty optional PO.
            if dataset.key = 'inventory_receipts' and not (item ? 'purchase_order') then
                item := jsonb_set(item, '{purchase_order}', '""'::jsonb);
            end if;
$addition$);
  end if;
 end if;
end $compat$;
notify pgrst,'reload schema';
commit;
