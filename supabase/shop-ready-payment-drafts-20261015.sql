-- Requires invoices, supplements, payment ledger, and customer billing migrations.
-- New transitions only: installing this migration never invoices existing ROs.
begin;

-- A technician can cause a system draft through an authorized RO update, but
-- cannot insert or edit invoices directly. The nested trigger is the only bypass
-- of the office-only supplement snapshot check; invoice RLS remains unchanged.
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
  base_subtotal:=greatest(0,round(ro.estimate_labor_hours*ro.estimate_labor_rate,2)+ro.estimate_parts_total+ro.estimate_shop_supplies+ro.estimate_environmental_fee+ro.estimate_other_charges-ro.estimate_discount);
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
 gross:=labor+new.estimate_parts_total+new.estimate_shop_supplies+new.estimate_environmental_fee+new.estimate_other_charges;
 original:=greatest(0,gross-new.estimate_discount);
 taxable_base:=greatest(0,labor+new.estimate_parts_total
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
notify pgrst,'reload schema';
commit;
