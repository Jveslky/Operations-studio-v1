-- Apply after shop-prebuilt-jobs-20261021.sql. Test first.
-- Adds explicit fixed labor revenue without inventing billed hours.
begin;
alter table public.shop_repair_orders add column if not exists estimate_prebuilt_labor_total numeric(12,2) not null default 0;
alter table public.shop_repair_orders add column if not exists estimate_prebuilt_parts_total numeric(12,2) not null default 0;
create or replace function public.shop_prebuilt_quote(d jsonb,p_rate numeric)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare mode text:=d->>'mode'; k text; n numeric; hours numeric; base_labor numeric; base_parts numeric; extras numeric:=0; l jsonb; qty numeric; included numeric; price numeric; charge numeric; labor numeric; parts numeric;
begin
 if mode is null or mode not in ('flat','itemized','mixed') or coalesce(d->>'labor_pricing','') not in ('included','hours') or jsonb_typeof(d->'lines') is distinct from 'array' then raise exception 'Invalid prebuilt pricing definition.';end if;
 if p_rate is null or p_rate<0 or p_rate>9999999 or p_rate<>round(p_rate,2) then raise exception 'Invalid prebuilt labor rate.';end if;
 foreach k in array array['base_price','base_labor','base_parts','expected_hours','billable_hours'] loop
  if coalesce(d->>k,'')!~'^[0-9]+([.][0-9]{1,3})?$' then raise exception 'Enter expected time, billable hours and package allocations.';end if;
  n:=(d->>k)::numeric;if n>9999999 or (k in ('base_price','base_labor','base_parts') and n<>round(n,2)) then raise exception 'Invalid time or allocation.';end if;
 end loop;
 if mode<>'itemized' and (d->>'base_labor')::numeric+(d->>'base_parts')::numeric<>(d->>'base_price')::numeric then raise exception 'Labor and parts allocations must equal the package price.';end if;
 hours:=case when mode='itemized' or (mode='mixed' and d->>'labor_pricing'='hours') then (d->>'billable_hours')::numeric else 0 end;
 base_labor:=case when mode='itemized' then 0 else (d->>'base_labor')::numeric end;
 base_parts:=case when mode='itemized' then 0 else (d->>'base_parts')::numeric end;
 if jsonb_array_length(d->'lines')>50 then raise exception 'Too many prebuilt parts.';end if;
 for l in select value from jsonb_array_elements(d->'lines') loop
  if coalesce(l->>'pricing','') not in ('included','difference','itemized') then raise exception 'Invalid part pricing.';end if;
  foreach k in array array['quantity','included_quantity','unit_price','allowance','extra_price'] loop
   if coalesce(l->>k,'')!~'^[0-9]+([.][0-9]{1,3})?$' then raise exception 'Invalid prebuilt part price or quantity.';end if;
   n:=(l->>k)::numeric;if n>9999999 or (k='quantity' and n<=0) or (k in ('unit_price','allowance','extra_price') and n<>round(n,2)) then raise exception 'Invalid prebuilt part price or quantity.';end if;
  end loop;
  qty:=(l->>'quantity')::numeric;included:=least(qty,(l->>'included_quantity')::numeric);price:=(l->>'unit_price')::numeric;
  if mode='itemized' or (mode='mixed' and l->>'pricing'='itemized') then charge:=qty*price;
  else charge:=(qty-included)*(l->>'extra_price')::numeric+case when l->>'pricing'='difference' then included*greatest(0,price-(l->>'allowance')::numeric) else 0 end;end if;
  extras:=extras+round(charge,2);
 end loop;
 labor:=base_labor+round(hours*p_rate,2);parts:=base_parts+extras;
 if labor+parts>9999999 then raise exception 'Job price is too large.';end if;
 return jsonb_build_object('labor',labor,'parts',parts,'total',labor+parts,'expectedHours',(d->>'expected_hours')::numeric,'laborHours',hours);
end $$;
revoke all on function public.shop_prebuilt_quote(jsonb,numeric) from public,anon,authenticated;
create or replace function public.validate_prebuilt_definition() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin perform public.shop_prebuilt_quote(new.definition,0);return new;end $$;
drop trigger if exists validate_prebuilt_definition on public.shop_prebuilt_jobs;
create trigger validate_prebuilt_definition before insert or update of definition on public.shop_prebuilt_jobs for each row execute function public.validate_prebuilt_definition();

create or replace function public.calculate_ro_prebuilt_allocations() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare job jsonb; q jsonb; labor numeric:=0; parts numeric:=0;
begin
 if jsonb_typeof(new.estimate_prebuilt_jobs) is distinct from 'array' then raise exception 'Invalid prebuilt instances.';end if;
 if exists(select 1 from jsonb_array_elements(new.estimate_prebuilt_jobs) j where j->>'schema_version'='2' group by j->>'instance_id' having count(*)>1) then raise exception 'Duplicate prebuilt instance.';end if;
 for job in select value from jsonb_array_elements(new.estimate_prebuilt_jobs) loop
  -- Preserve old draft instances in their original aggregate fields. Never silently
  -- convert a legacy package's Other charge or fabricate its revenue split.
  if job->>'schema_version' is distinct from '2' then continue;end if;
  if coalesce(job->>'instance_id','')='' then raise exception 'Missing prebuilt instance identity.';end if;
  q:=public.shop_prebuilt_quote(job->'definition',(job->'quote'->>'rate')::numeric);
  if (job->'quote'->'labor') is distinct from (q->'labor') or (job->'quote'->'parts') is distinct from (q->'parts') or (job->'quote'->'total') is distinct from (q->'total') then raise exception 'Prebuilt quote does not match its reviewed definition.';end if;
  labor:=labor+(q->>'labor')::numeric;parts:=parts+(q->>'parts')::numeric;
 end loop;
 if labor>9999999999.99 or parts>9999999999.99 then raise exception 'Prebuilt totals too large.';end if;
 new.estimate_prebuilt_labor_total:=labor;new.estimate_prebuilt_parts_total:=parts;
 if new.estimate_parts_total<parts then raise exception 'Parts total cannot be below included prebuilt parts. Revise the copied job pricing first.';end if;
 return new;
end $$;
drop trigger if exists aa_ro_prebuilt_allocations on public.shop_repair_orders;
create trigger aa_ro_prebuilt_allocations before insert or update on public.shop_repair_orders for each row execute function public.calculate_ro_prebuilt_allocations();

-- Preserve existing ready-payment and authorization behavior with fixed prebuilt labor.
create or replace function public.shop_estimate_authorization_totals(ro jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare taxable boolean; rate numeric; customer_status text; subtotal numeric; base numeric; tax numeric;
 labor numeric := coalesce((ro->>'estimate_labor_hours')::numeric,0)*coalesce((ro->>'estimate_labor_rate')::numeric,0)+coalesce((ro->>'estimate_prebuilt_labor_total')::numeric,0);
 parts numeric := coalesce((ro->>'estimate_parts_total')::numeric,0);
 supplies numeric := coalesce((ro->>'estimate_shop_supplies')::numeric,0);
 environmental numeric := coalesce((ro->>'estimate_environmental_fee')::numeric,0);
 other_fee numeric := coalesce((ro->>'estimate_other_charges')::numeric,0);
 discount numeric := coalesce((ro->>'estimate_discount')::numeric,0);
begin
 select default_taxable,default_tax_rate into taxable,rate from public.shops where id=(ro->>'shop_id')::uuid;
 if not found then raise exception 'Shop tax settings unavailable.'; end if;
 select tax_status into customer_status from public.customer_tax_profiles where shop_id=(ro->>'shop_id')::uuid and customer_id=ro->>'customer_id';
 customer_status := coalesce(customer_status,'inherit');
 taxable := case customer_status when 'taxable' then true when 'exempt' then false else taxable end;
 if not taxable then rate := 0; end if;
 subtotal := round(greatest(0,labor+parts+supplies+environmental+other_fee-discount),2);
 base := greatest(0,labor+parts+case when coalesce((ro->>'estimate_shop_supplies_taxable')::boolean,true) then supplies else 0 end
   +case when coalesce((ro->>'estimate_environmental_fee_taxable')::boolean,false) then environmental else 0 end
   +case when coalesce((ro->>'estimate_misc_fee_taxable')::boolean,true) then other_fee else 0 end-discount);
 tax := case when taxable then round(base*rate/100,2) else 0 end;
 return jsonb_build_object('subtotal',subtotal,'tax',tax,'total',subtotal+tax,'taxable',taxable,'rate',rate,'customer_tax_status',customer_status);
end; $$;
revoke all on function public.shop_estimate_authorization_totals(jsonb) from public,anon,authenticated;
create or replace function public.snapshot_shop_invoice_supplements()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; captured jsonb; expected jsonb; supplement_total numeric; base_subtotal numeric;
begin
 if new.repair_order_id is null then return new; end if;
 select * into ro from public.shop_repair_orders where id=new.repair_order_id for update;
 if ro.id is null or ro.shop_id<>new.shop_id or not (public.has_shop_role(ro.shop_id,array['owner','admin','service_writer']) or
  (pg_trigger_depth()>1 and current_user<>'authenticated' and new.status='Draft'
   and new.created_by=auth.uid() and ro.status='Ready for Payment'
   and public.has_shop_role(ro.shop_id,array['technician']))) then raise exception 'Repair order is unavailable for invoicing.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by id),'[]'::jsonb),coalesce(sum(total),0),coalesce(jsonb_agg(to_jsonb(s) order by supplement_number),'[]'::jsonb) into expected,supplement_total,captured from public.shop_supplemental_estimates s where repair_order_id=ro.id and status='Approved';
 if expected<>'[]'::jsonb or coalesce(new.fee_snapshot->'supplements','[]'::jsonb)<>'[]'::jsonb then
  if (select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','revision',(v->>'revision')::integer) order by v->>'id'),'[]'::jsonb) from jsonb_array_elements(coalesce(new.fee_snapshot->'supplements','[]'::jsonb)) v) is distinct from expected then raise exception 'Approved supplements changed. Refresh and recreate the invoice preview.'; end if;
  base_subtotal:=greatest(0,round(ro.estimate_labor_hours*ro.estimate_labor_rate,2)+ro.estimate_parts_total+ro.estimate_prebuilt_labor_total+ro.estimate_shop_supplies+ro.estimate_environmental_fee+ro.estimate_other_charges-ro.estimate_discount);
  if new.subtotal<>base_subtotal+supplement_total then raise exception 'Invoice subtotal does not match the original estimate plus approved supplements.'; end if;
  new.fee_snapshot:=jsonb_set(coalesce(new.fee_snapshot,'{}'::jsonb),'{supplements}',captured);
 end if;
 return new;
end; $$;
revoke all on function public.snapshot_shop_invoice_supplements() from public;
drop trigger if exists snapshot_shop_invoice_supplements on public.shop_invoices;
create trigger snapshot_shop_invoice_supplements before insert on public.shop_invoices for each row execute function public.snapshot_shop_invoice_supplements();

create or replace function public.draft_shop_invoice_when_finished()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 labor numeric; gross numeric; original numeric; taxable_base numeric;
 supplements jsonb; supplement_subtotal numeric; supplement_taxable numeric;
 billing jsonb; taxable boolean; rate numeric; tax numeric; shop_day date;
 contact_email text; contact_phone text;
begin
 if new.status<>'Ready for Payment' or old.status is not distinct from new.status
    or new.archived or new.shop_id is distinct from old.shop_id then return new;end if;
 -- The originating update/RPC enforces RO access; this does not grant RO access.
 if auth.uid() is null or not public.has_shop_role(new.shop_id,array['owner','admin','service_writer','technician']) then
  raise exception 'A shop staff session is required to prepare the invoice draft.';
 end if;
 if exists(select 1 from public.shop_invoices where repair_order_id=new.id) then return new;end if;
 if exists(select 1 from public.shop_supplemental_estimates where repair_order_id=new.id and status in ('Draft','Sent')) then
  raise exception 'Approve or decline pending supplemental estimates before marking Ready for Payment. No invoice draft was created.';
 end if;
 if least(new.estimate_labor_hours,new.estimate_labor_rate,new.estimate_parts_total,new.estimate_shop_supplies,
   new.estimate_environmental_fee,new.estimate_other_charges,new.estimate_discount)<0 then
  raise exception 'Estimate prices and hours must be nonnegative before preparing an invoice draft.';
 end if;
 labor:=round(new.estimate_labor_hours*new.estimate_labor_rate,2);
 gross:=labor+new.estimate_prebuilt_labor_total+new.estimate_parts_total+new.estimate_shop_supplies+new.estimate_environmental_fee+new.estimate_other_charges;
 original:=greatest(0,gross-new.estimate_discount);
 taxable_base:=greatest(0,labor+new.estimate_prebuilt_labor_total+new.estimate_parts_total
  +case when new.estimate_shop_supplies_taxable then new.estimate_shop_supplies else 0 end
  +case when new.estimate_environmental_fee_taxable then new.estimate_environmental_fee else 0 end
  +case when new.estimate_misc_fee_taxable then new.estimate_other_charges else 0 end-new.estimate_discount);
 select coalesce(jsonb_agg(to_jsonb(s) order by supplement_number),'[]'::jsonb),coalesce(sum(total),0),
  coalesce(sum(greatest(0,round(labor_hours*labor_rate,2)+parts_total+case when other_taxable then other_charges else 0 end-discount)),0)
 into supplements,supplement_subtotal,supplement_taxable
 from public.shop_supplemental_estimates s where repair_order_id=new.id and shop_id=new.shop_id and status='Approved';
 taxable_base:=taxable_base+supplement_taxable;
 billing:=coalesce(public.shop_customer_billing_snapshot(new.shop_id,new.customer_id),'{}'::jsonb);
 select case billing->>'taxStatus' when 'taxable' then true when 'exempt' then false else default_taxable end,
  default_tax_rate,(now() at time zone coalesce(nullif(timezone,''),'UTC'))::date
 into taxable,rate,shop_day from public.shops where id=new.shop_id;
 rate:=case when taxable then coalesce(rate,0) else 0 end;
 taxable_base:=case when taxable then taxable_base else 0 end;
 tax:=round(taxable_base*rate/100,2);
 select coalesce(email,''),coalesce(phone,'') into contact_email,contact_phone
 from public."Customers" where id::text=new.customer_id and shop_id=new.shop_id;
 -- Definer inserts intentionally supply complete snapshots: the existing billing
 -- trigger preserves non-authenticated inserts for backup restores. Do not change
 -- that restore behavior or rely on the actor's ability to read financial tables.
 insert into public.shop_invoices(shop_id,repair_order_id,repair_order_number,source_type,
  customer_id,unit_id,customer_name,unit_name,customer_email,customer_phone,complaint,
  subtotal,tax_amount,total,tax_snapshot,fee_snapshot,billing_snapshot,status,due_date,created_by)
 values(new.shop_id,new.id,new.ro_number,'repair-order',new.customer_id,new.unit_id,new.customer_name,new.unit_name,
  coalesce(nullif(billing->>'billingEmail',''),contact_email,''),coalesce(nullif(billing->>'billingPhone',''),contact_phone,''),new.complaint,
  original+supplement_subtotal,tax,original+supplement_subtotal+tax,
  jsonb_build_object('taxable',taxable,'rate',rate,'taxableBase',taxable_base,'customerTaxStatus',coalesce(billing->>'taxStatus','inherit'),
   'exemptionReason',billing->>'exemptionReason','exemptionCertificateNumber',billing->>'exemptionCertificateNumber','capturedAt',now()),
  jsonb_build_object('laborHours',new.estimate_labor_hours,'laborRate',new.estimate_labor_rate,'laborTotal',labor,'partsTotal',new.estimate_parts_total,
   'shopSupplies',new.estimate_shop_supplies,'shopSuppliesTaxable',new.estimate_shop_supplies_taxable,
   'environmentalFee',new.estimate_environmental_fee,'environmentalFeeTaxable',new.estimate_environmental_fee_taxable,
   'miscellaneousFee',new.estimate_other_charges,'miscellaneousFeeLabel',coalesce(nullif(new.estimate_misc_fee_label,''),'Miscellaneous fee'),
   'miscellaneousFeeTaxable',new.estimate_misc_fee_taxable,'discount',new.estimate_discount,'grossSubtotal',gross,
   'originalSubtotal',original,'supplementSubtotal',supplement_subtotal,'subtotal',original+supplement_subtotal,
   'taxableBase',taxable_base,'supplements',supplements,'creationSource','ready-for-payment'),
  billing,'Draft',shop_day+coalesce((billing->>'termsDays')::integer,0),auth.uid())
 on conflict(repair_order_id) where repair_order_id is not null do nothing;
 return new;
end; $$;
revoke all on function public.draft_shop_invoice_when_finished() from public,anon,authenticated;
drop trigger if exists draft_shop_invoice_when_finished on public.shop_repair_orders;
create trigger draft_shop_invoice_when_finished after update of status on public.shop_repair_orders
for each row execute function public.draft_shop_invoice_when_finished();

create or replace function public.capture_prebuilt_invoice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; supplements numeric; expected numeric;
begin
 if tg_op='INSERT' and new.repair_order_id is not null then
  select * into ro from public.shop_repair_orders where id=new.repair_order_id and shop_id=new.shop_id;
  if ro.id is not null and ro.estimate_prebuilt_jobs<>'[]'::jsonb then
   if ro.estimate_prebuilt_labor_total>0 or ro.estimate_prebuilt_parts_total>0 then
    select coalesce(sum(total),0) into supplements from shop_supplemental_estimates where shop_id=ro.shop_id and repair_order_id=ro.id and status='Approved';
    expected:=(public.shop_estimate_authorization_totals(to_jsonb(ro))->>'subtotal')::numeric+supplements;
    if new.subtotal<>expected then raise exception 'Invoice preview is stale. Review the prebuilt allocations and recreate the preview.';end if;
   end if;
   new.fee_snapshot:=coalesce(new.fee_snapshot,'{}'::jsonb)||jsonb_build_object('prebuiltJobs',ro.estimate_prebuilt_jobs,'prebuiltLaborTotal',ro.estimate_prebuilt_labor_total,'prebuiltPartsTotal',ro.estimate_prebuilt_parts_total);
  end if;
 elsif tg_op='UPDATE' and old.fee_snapshot ? 'prebuiltJobs' then
  new.fee_snapshot:=coalesce(new.fee_snapshot,'{}'::jsonb)||jsonb_build_object('prebuiltJobs',old.fee_snapshot->'prebuiltJobs','prebuiltLaborTotal',coalesce(old.fee_snapshot->'prebuiltLaborTotal','0'::jsonb),'prebuiltPartsTotal',coalesce(old.fee_snapshot->'prebuiltPartsTotal','0'::jsonb));
 end if;return new;
end $$;
notify pgrst,'reload schema';
commit;
