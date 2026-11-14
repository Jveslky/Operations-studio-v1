-- AP independent duplicate review and audit. Apply to Test before the updated UI.
begin;
create table if not exists public.shop_ap_bill_operations (
 shop_id uuid not null references public.shops(id), request_id uuid not null,
 actor uuid not null, payload jsonb not null, bill_id uuid not null references public.shop_accounts_payable(id),
 created_at timestamptz not null default now(), primary key(shop_id,request_id)
);
alter table public.shop_ap_bill_operations enable row level security;
revoke all on public.shop_ap_bill_operations from public, anon, authenticated;
create table if not exists public.shop_ap_duplicate_overrides (
 shop_id uuid not null references public.shops(id), bill_id uuid primary key references public.shop_accounts_payable(id),
 actor uuid not null, matched_bill_ids uuid[] not null, created_at timestamptz not null default now()
);
alter table public.shop_ap_duplicate_overrides enable row level security;
revoke all on public.shop_ap_duplicate_overrides from public, anon, authenticated;
grant select on public.shop_ap_duplicate_overrides to authenticated;
drop policy if exists shop_ap_duplicate_overrides_read on public.shop_ap_duplicate_overrides;
create policy shop_ap_duplicate_overrides_read on public.shop_ap_duplicate_overrides
 for select to authenticated using (public.shop_has_permission(shop_id,'expenses.read'));
create or replace function public.create_shop_ap_bill_once(p_shop uuid,p_request uuid,p_record jsonb)
returns public.shop_accounts_payable language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.shop_ap_bill_operations; result public.shop_accounts_payable; path text; matches uuid[]; acknowledged uuid[];
begin
 if p_shop is null or p_request is null or auth.uid() is null or not public.shop_has_permission(p_shop,'expenses.write') then
  raise exception 'AP write permission required';
 end if;
 if jsonb_typeof(p_record) <> 'object' or p_record is null then raise exception 'Bill details required'; end if;
 if coalesce(p_record->>'shop_id','')<>p_shop::text or coalesce(p_record->>'created_by','')<>auth.uid()::text then raise exception 'Bill scope does not match session'; end if;
 if coalesce(trim(p_record->>'vendor'),'')='' or p_record->>'status' <> 'open' then raise exception 'Valid bill details required'; end if;
 path:=nullif(p_record->>'document_path','');
 if path is not null and split_part(path,'/',1)<>p_shop::text then raise exception 'Document does not belong to this shop'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text||':'||p_request::text,0));
 select * into prior from public.shop_ap_bill_operations where shop_id=p_shop and request_id=p_request;
 if found then
  if prior.actor<>auth.uid() or prior.payload<>p_record then raise exception 'This bill request was already used for different details'; end if;
  select * into result from public.shop_accounts_payable where id=prior.bill_id and shop_id=p_shop;
  if not found then raise exception 'Original bill is unavailable; review the ledger'; end if;
  return result;
 end if;
 -- Serialize independent submissions for the shop, after exact-request replay.
 perform pg_advisory_xact_lock(hashtextextended('ap-duplicates:'||p_shop::text,0));
 select coalesce(array_agg(b.id order by b.id),array[]::uuid[]) into matches
 from public.shop_accounts_payable b
 where b.shop_id=p_shop and b.status is distinct from 'void'
 and lower(trim(b.vendor))=lower(trim(p_record->>'vendor'))
 and (case when nullif(trim(coalesce(p_record->>'invoice_number','')),'') is not null
   then lower(trim(coalesce(b.invoice_number,'')))=lower(trim(p_record->>'invoice_number'))
   else nullif(p_record->>'invoice_date','') is not null and b.invoice_date is not null
     and b.total=(p_record->>'total')::numeric
     and abs(b.invoice_date-(p_record->>'invoice_date')::date)<=3 end);
 if coalesce(jsonb_typeof(p_record->'duplicate_override_ids'),'null')='array' then
  select coalesce(array_agg(value::uuid order by value::uuid),array[]::uuid[]) into acknowledged
  from jsonb_array_elements_text(p_record->'duplicate_override_ids');
 else acknowledged:=array[]::uuid[]; end if;
 if cardinality(matches)>0 and matches<>acknowledged then raise exception 'AP_DUPLICATE_REVIEW_REQUIRED'; end if;
 if cardinality(matches)=0 and cardinality(acknowledged)>0 then raise exception 'AP_DUPLICATE_REVIEW_REQUIRED'; end if;
 if path is not null and not exists(select 1 from storage.objects where bucket_id='shop-ap-documents' and name=path) then raise exception 'Original document is unavailable'; end if;
 insert into public.shop_accounts_payable(shop_id,vendor,invoice_number,invoice_date,due_date,subtotal,tax,total,category,repair_order_id,notes,document_path,ocr_text,status,created_by)
 values(p_shop,trim(p_record->>'vendor'),nullif(p_record->>'invoice_number',''),nullif(p_record->>'invoice_date','')::date,nullif(p_record->>'due_date','')::date,
 nullif(p_record->>'subtotal','')::numeric,nullif(p_record->>'tax','')::numeric,(p_record->>'total')::numeric,
 nullif(p_record->>'category',''),nullif(p_record->>'repair_order_id',''),nullif(p_record->>'notes',''),path,nullif(p_record->>'ocr_text',''),'open',auth.uid()) returning * into result;
 if cardinality(matches)>0 then
  insert into public.shop_ap_duplicate_overrides(shop_id,bill_id,actor,matched_bill_ids) values(p_shop,result.id,auth.uid(),matches);
 end if;
 insert into public.shop_ap_bill_operations(shop_id,request_id,actor,payload,bill_id) values(p_shop,p_request,auth.uid(),p_record,result.id);
 return result;
end $$;
revoke all on function public.create_shop_ap_bill_once(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_shop_ap_bill_once(uuid,uuid,jsonb) to authenticated;
commit;
