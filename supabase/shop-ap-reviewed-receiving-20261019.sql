-- Requires AP scanning and inventory foundation/permissions. Install in Test first.
begin;
create table if not exists public.shop_ap_stock_receipts (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 bill_id uuid not null references public.shop_accounts_payable(id),
 receipt_id uuid not null unique references public.shop_inventory_receipts(id),
 request_id uuid not null, review jsonb not null, source_snapshot jsonb not null,
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 unique(shop_id,request_id));
alter table public.shop_ap_stock_receipts enable row level security;
revoke all on public.shop_ap_stock_receipts from public,anon,authenticated;
grant select on public.shop_ap_stock_receipts to authenticated;
drop policy if exists ap_stock_read on public.shop_ap_stock_receipts;
create policy ap_stock_read on public.shop_ap_stock_receipts for select to authenticated
 using(public.shop_inventory_can(shop_id,'read') and public.shop_has_permission(shop_id,'expenses.read'));
drop trigger if exists ap_stock_immutable on public.shop_ap_stock_receipts;
create trigger ap_stock_immutable before update or delete on public.shop_ap_stock_receipts for each row execute function public.immutable_shop_inventory();

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
 result:=public.receive_shop_inventory(p_shop,p_request,jsonb_build_object('supplier',bill.vendor,'invoice_reference',bill.invoice_number,'delivery_reference',trim(p_review->>'delivery'),'notes','Reviewed AP bill '||bill.id::text),lines);
 insert into shop_ap_stock_receipts(shop_id,bill_id,receipt_id,request_id,review,source_snapshot,recorded_by)
 values(p_shop,p_bill,(result->'receipt'->>'id')::uuid,p_request,p_review,to_jsonb(bill),auth.uid());
 return jsonb_build_object('receipt_id',result->'receipt'->>'id');
end;$$;
revoke all on function public.receive_shop_ap_stock(uuid,uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.receive_shop_ap_stock(uuid,uuid,uuid,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
