-- Requires shop repair orders, invoices, and estimate approval migrations. Test first.
begin;
create table if not exists public.shop_supplemental_estimates (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 repair_order_id uuid not null references public.shop_repair_orders(id), supplement_number integer not null,
 revision integer not null default 1, description text not null check(length(trim(description)) between 1 and 2000),
 labor_hours numeric(10,2) not null default 0 check(labor_hours>=0), labor_rate numeric(12,2) not null default 0 check(labor_rate>=0),
 parts_total numeric(12,2) not null default 0 check(parts_total>=0), other_charges numeric(12,2) not null default 0 check(other_charges>=0),
 other_taxable boolean not null default false, discount numeric(12,2) not null default 0 check(discount>=0),
 total numeric(12,2) not null, notes text not null default '' check(length(notes)<=4000),
 status text not null default 'Draft' check(status in ('Draft','Sent','Approved','Declined')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(repair_order_id,supplement_number)
);
create table if not exists public.shop_supplement_authorizations (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 repair_order_id uuid not null references public.shop_repair_orders(id), supplement_id uuid not null references public.shop_supplemental_estimates(id),
 revision integer not null, estimate_snapshot jsonb not null, authorized_amount numeric(12,2) not null,
 method text not null check(method in ('verbal','written','digital')), customer_contact text not null check(length(trim(customer_contact)) between 1 and 200),
 notes text not null default '' check(length(notes)<=4000), evidence_path text, evidence_name text,
 recorded_by uuid not null references auth.users(id), recorded_by_email text not null, recorded_at timestamptz not null default now(),
 unique(supplement_id,revision)
);
alter table public.shop_supplemental_estimates enable row level security;
alter table public.shop_supplement_authorizations enable row level security;
revoke all on public.shop_supplemental_estimates,public.shop_supplement_authorizations from anon,authenticated;
grant select on public.shop_supplemental_estimates,public.shop_supplement_authorizations to authenticated;
drop policy if exists "office reads supplements" on public.shop_supplemental_estimates;
create policy "office reads supplements" on public.shop_supplemental_estimates for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "office reads supplement approvals" on public.shop_supplement_authorizations;
create policy "office reads supplement approvals" on public.shop_supplement_authorizations for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin','service_writer']));

create or replace function public.save_shop_supplement(p_ro uuid,p_id uuid,p_expected_updated_at timestamptz,p_estimate jsonb)
returns public.shop_supplemental_estimates language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; previous public.shop_supplemental_estimates; result public.shop_supplemental_estimates;
 description_value text; hours_value numeric(10,2); rate_value numeric(12,2); parts_value numeric(12,2); other_value numeric(12,2); discount_value numeric(12,2); total_value numeric(12,2); changed boolean;
begin
 select * into ro from public.shop_repair_orders where id=p_ro for update;
 if ro.id is null or auth.uid() is null or not public.has_shop_role(ro.shop_id,array['owner','admin','service_writer']) then raise exception 'Your role cannot save this supplemental estimate.'; end if;
 if ro.archived then raise exception 'Archived repair orders cannot be edited.'; end if;
 if exists(select 1 from public.shop_invoices where repair_order_id=p_ro) then raise exception 'This repair order is already invoiced. Its supplemental estimates are locked.'; end if;
 description_value:=trim(p_estimate->>'description');
 if coalesce(length(description_value),0) not between 1 and 2000 then raise exception 'Describe the additional work.'; end if;
 if coalesce(p_estimate->>'status','Draft') not in ('Draft','Sent','Declined') then raise exception 'Record customer authorization to approve a supplement.'; end if;
 if exists(select 1 from jsonb_each_text(p_estimate) where key in ('labor_hours','labor_rate','parts_total','other_charges','discount') and value !~ '^[0-9]+([.][0-9]{1,2})?$') then raise exception 'Prices and hours must be nonnegative with up to two decimal places.'; end if;
 hours_value:=coalesce((p_estimate->>'labor_hours')::numeric,0); rate_value:=coalesce((p_estimate->>'labor_rate')::numeric,0);
 parts_value:=coalesce((p_estimate->>'parts_total')::numeric,0); other_value:=coalesce((p_estimate->>'other_charges')::numeric,0); discount_value:=coalesce((p_estimate->>'discount')::numeric,0);
 total_value:=greatest(0,round(hours_value*rate_value,2)+parts_value+other_value-discount_value);
 if p_id is null then
  insert into public.shop_supplemental_estimates(shop_id,repair_order_id,supplement_number,description,labor_hours,labor_rate,parts_total,other_charges,other_taxable,discount,total,notes,status,created_by)
  values(ro.shop_id,p_ro,(select coalesce(max(supplement_number),0)+1 from public.shop_supplemental_estimates where repair_order_id=p_ro),description_value,hours_value,rate_value,parts_value,other_value,coalesce((p_estimate->>'other_taxable')::boolean,false),discount_value,total_value,coalesce(p_estimate->>'notes',''),coalesce(p_estimate->>'status','Draft'),auth.uid()) returning * into result;
 else
  select * into previous from public.shop_supplemental_estimates where id=p_id and repair_order_id=p_ro and shop_id=ro.shop_id;
  if previous.id is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Supplement changed. Refresh and review before saving.'; end if;
  changed:=row(previous.description,previous.labor_hours,previous.labor_rate,previous.parts_total,previous.other_charges,previous.other_taxable,previous.discount,previous.notes) is distinct from row(description_value,hours_value,rate_value,parts_value,other_value,coalesce((p_estimate->>'other_taxable')::boolean,false),discount_value,coalesce(p_estimate->>'notes',''));
  update public.shop_supplemental_estimates set description=description_value,labor_hours=hours_value,labor_rate=rate_value,parts_total=parts_value,other_charges=other_value,other_taxable=coalesce((p_estimate->>'other_taxable')::boolean,false),discount=discount_value,total=total_value,notes=coalesce(p_estimate->>'notes',''),revision=previous.revision+case when changed then 1 else 0 end,
   status=case when changed then 'Draft' when previous.status='Approved' then 'Approved' else coalesce(p_estimate->>'status','Draft') end,updated_at=clock_timestamp() where id=p_id returning * into result;
 end if;
 return result;
end; $$;

create or replace function public.approve_shop_supplement(p_id uuid,p_expected_updated_at timestamptz,p_revision integer,p_authorization jsonb)
returns public.shop_supplemental_estimates language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; supplement public.shop_supplemental_estimates; actor_email text; file_path text;
begin
 select r.* into ro from public.shop_repair_orders r join public.shop_supplemental_estimates s on s.repair_order_id=r.id where s.id=p_id for update of r;
 if ro.id is null or auth.uid() is null or not public.has_shop_role(ro.shop_id,array['owner','admin','service_writer']) then raise exception 'Your role cannot approve this supplemental estimate.'; end if;
 if ro.archived or exists(select 1 from public.shop_invoices where repair_order_id=ro.id) then raise exception 'Archived or invoiced repair orders cannot be approved.'; end if;
 select * into supplement from public.shop_supplemental_estimates where id=p_id;
 if supplement.updated_at is distinct from p_expected_updated_at or supplement.revision is distinct from p_revision then raise exception 'Supplement changed. Refresh and review before approving.'; end if;
 if supplement.status='Approved' then raise exception 'This supplement revision is already approved.'; end if;
 if coalesce(p_authorization->>'method','') not in ('verbal','written','digital') or coalesce(length(trim(p_authorization->>'customer_contact')),0) not between 1 and 200 then raise exception 'Approval method and customer/contact name are required.'; end if;
 if p_authorization->>'method'='verbal' and coalesce(length(trim(p_authorization->>'notes')),0)=0 then raise exception 'Add a note describing the verbal authorization.'; end if;
 file_path:=nullif(p_authorization->>'evidence_path','');
 if file_path is not null and (split_part(file_path,'/',1)<>ro.shop_id::text or split_part(file_path,'/',2)<>ro.id::text or not exists(select 1 from storage.objects where bucket_id='shop-approval-evidence' and name=file_path and owner_id=auth.uid()::text)) then raise exception 'Approval evidence is unavailable or belongs to another record.'; end if;
 select coalesce(email,'') into actor_email from auth.users where id=auth.uid();
 insert into public.shop_supplement_authorizations(shop_id,repair_order_id,supplement_id,revision,estimate_snapshot,authorized_amount,method,customer_contact,notes,evidence_path,evidence_name,recorded_by,recorded_by_email)
 values(ro.shop_id,ro.id,p_id,supplement.revision,to_jsonb(supplement),supplement.total,p_authorization->>'method',trim(p_authorization->>'customer_contact'),coalesce(p_authorization->>'notes',''),file_path,nullif(p_authorization->>'evidence_name',''),auth.uid(),coalesce(actor_email,''));
 update public.shop_supplemental_estimates set status='Approved',updated_at=clock_timestamp() where id=p_id returning * into supplement;
 if ro.status in ('Open','Intake','Scheduled','Waiting Approval','Needs Info') then update public.shop_repair_orders set status='In Progress' where id=ro.id; end if;
 return supplement;
end; $$;
revoke all on function public.save_shop_supplement(uuid,uuid,timestamptz,jsonb),public.approve_shop_supplement(uuid,timestamptz,integer,jsonb) from public;
grant execute on function public.save_shop_supplement(uuid,uuid,timestamptz,jsonb),public.approve_shop_supplement(uuid,timestamptz,integer,jsonb) to authenticated;

-- Extend evidence reads to immutable supplement authorization records.
drop policy if exists "office reads supplement evidence" on storage.objects;
create policy "office reads supplement evidence" on storage.objects for select to authenticated using(bucket_id='shop-approval-evidence' and exists(select 1 from public.shop_supplement_authorizations a where a.evidence_path=name and public.has_shop_role(a.shop_id,array['owner','admin','service_writer'])));

create or replace function public.snapshot_shop_invoice_supplements()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; captured jsonb; expected jsonb; supplement_total numeric; base_subtotal numeric;
begin
 if new.repair_order_id is null then return new; end if;
 select * into ro from public.shop_repair_orders where id=new.repair_order_id for update;
 if ro.id is null or ro.shop_id<>new.shop_id or not public.has_shop_role(ro.shop_id,array['owner','admin','service_writer']) then raise exception 'Repair order is unavailable for invoicing.'; end if;
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
notify pgrst,'reload schema';
commit;
select to_regclass('public.shop_supplemental_estimates') is not null as supplements_installed, to_regprocedure('public.approve_shop_supplement(uuid,timestamp with time zone,integer,jsonb)') is not null as supplement_approval_installed;
