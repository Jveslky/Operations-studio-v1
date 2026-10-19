-- Requires PR108 inventory holds, supplement estimates, approval tax, and ready-payment drafts.
-- Test first. No backfill or change to existing authorizations/invoices.
begin;
alter table public.shop_supplemental_estimates add column if not exists stock_lines jsonb not null default '[]';
alter table public.shop_ro_stock_events add column if not exists supplement_id uuid references public.shop_supplemental_estimates(id);
create index if not exists supplement_stock_source on public.shop_ro_stock_events(supplement_id,item_id);
create table if not exists public.shop_supplement_stock_settlements (
 supplement_id uuid primary key references public.shop_supplemental_estimates(id),recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now());
create table if not exists public.shop_supplement_stock_confirmations (
 repair_order_id uuid references public.shop_repair_orders(id),user_id uuid references auth.users(id),manifest jsonb not null,recorded_at timestamptz not null default now(),primary key(repair_order_id,user_id));
alter table public.shop_supplement_stock_settlements enable row level security;
alter table public.shop_supplement_stock_confirmations enable row level security;
revoke all on public.shop_supplement_stock_settlements,public.shop_supplement_stock_confirmations from public,anon,authenticated;

create or replace function public.shop_supplement_authorization_totals(s jsonb,ro jsonb)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select public.shop_estimate_authorization_totals(jsonb_build_object('shop_id',ro->>'shop_id','customer_id',ro->>'customer_id',
 'estimate_labor_hours',1,'estimate_labor_rate',round(coalesce((s->>'labor_hours')::numeric,0)*coalesce((s->>'labor_rate')::numeric,0),2),
 'estimate_parts_total',s->'parts_total','estimate_other_charges',s->'other_charges','estimate_misc_fee_taxable',s->'other_taxable','estimate_discount',s->'discount'));
$$;
revoke all on function public.shop_supplement_authorization_totals(jsonb,jsonb) from public,anon,authenticated;

-- All RO stock mutations lock every involved item in one order, including baseline items.
create or replace function public.lock_all_ro_stock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from shop_inventory_items where shop_id=new.shop_id and id in (
 select (x->>'item_id')::uuid from jsonb_array_elements(new.estimate_stock_lines) x
 union select e.item_id from shop_ro_stock_events e where e.repair_order_id=new.id
 union select (x->>'item_id')::uuid from shop_supplemental_estimates s cross join lateral jsonb_array_elements(s.stock_lines) x where s.repair_order_id=new.id)
 order by id for update;
 return new;
end;$$;
revoke all on function public.lock_all_ro_stock() from public,anon,authenticated;
drop trigger if exists a0_all_stock_locks on public.shop_repair_orders;
create trigger a0_all_stock_locks before update on public.shop_repair_orders for each row execute function public.lock_all_ro_stock();

create or replace function public.reconcile_supplement_stock(p_s public.shop_supplemental_estimates,p_wanted boolean,p_consume boolean,p_validate boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.shop_inventory_items;line jsonb;oldqty numeric;newqty numeric;delta numeric;counts record;actor text;req uuid:=gen_random_uuid();
begin
 if jsonb_typeof(p_s.stock_lines) is distinct from 'array' or jsonb_array_length(p_s.stock_lines)>100 then raise exception 'Invalid stocked supplement lines.';end if;
 if exists(select 1 from jsonb_array_elements(p_s.stock_lines) x group by x->>'item_id' having count(*)>1) then raise exception 'Combine duplicate stocked supplement lines.';end if;
 for line in select value from jsonb_array_elements(p_s.stock_lines) loop
  if coalesce((line->>'quantity')::numeric,0)<=0 or (line->>'quantity')::numeric<>round((line->>'quantity')::numeric,3)
   or coalesce((line->>'unit_price')::numeric,-1)<0 or (line->>'unit_price')::numeric<>round((line->>'unit_price')::numeric,2) then raise exception 'Invalid stock quantity or price.';end if;
  if not exists(select 1 from shop_inventory_items where shop_id=p_s.shop_id and id=(line->>'item_id')::uuid) then raise exception 'Stock part is unavailable in this shop.';end if;
 end loop;
 if coalesce((select sum(round((x->>'quantity')::numeric*(x->>'unit_price')::numeric,2)) from jsonb_array_elements(p_s.stock_lines) x),0)>p_s.parts_total then raise exception 'Parts total cannot be less than stocked lines.';end if;
 if exists(select 1 from shop_supplement_stock_settlements where supplement_id=p_s.id) then return;end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 for item in select * from shop_inventory_items where shop_id=p_s.shop_id and id in (
 select (x->>'item_id')::uuid from jsonb_array_elements(p_s.stock_lines) x union select item_id from shop_ro_stock_events where supplement_id=p_s.id) order by id for update loop
  select coalesce(sum(hold_delta),0) into oldqty from shop_ro_stock_events where supplement_id=p_s.id and item_id=item.id;
  select coalesce(sum((x->>'quantity')::numeric),0) into newqty from jsonb_array_elements(p_s.stock_lines) x where (x->>'item_id')::uuid=item.id;
  if not p_wanted then newqty:=0;end if;
  if p_validate and exists(select 1 from jsonb_array_elements(p_s.stock_lines) x where (x->>'item_id')::uuid=item.id and (x->>'part_number' is distinct from item.part_number or x->>'description' is distinct from item.description or x->>'stock_unit' is distinct from item.stock_unit)) then raise exception 'Catalog details changed. Select the part again.';end if;
  if item.archived and newqty>oldqty then raise exception 'Part is archived.';end if;
  delta:=newqty-oldqty;select * into counts from shop_stock_counts(p_s.shop_id,item.id);
  if delta>counts.available then raise exception 'Insufficient available stock for %. Available: %; additional hold: %.',item.part_number,counts.available,delta;end if;
  if delta<>0 then insert into shop_ro_stock_events(shop_id,repair_order_id,supplement_id,item_id,hold_delta,kind,reason,request_id,recorded_by,recorded_by_email)
   values(p_s.shop_id,p_s.repair_order_id,p_s.id,item.id,delta,case when delta>0 then 'hold' else 'release' end,'Supplement '||p_s.supplement_number||' · Saved allocation',req,auth.uid(),actor);end if;
  if p_consume and newqty>0 then insert into shop_ro_stock_events(shop_id,repair_order_id,supplement_id,item_id,hold_delta,stock_delta,kind,reason,request_id,recorded_by,recorded_by_email)
   values(p_s.shop_id,p_s.repair_order_id,p_s.id,item.id,-newqty,-newqty,'consume','Supplement '||p_s.supplement_number||' · Confirmed Ready for Payment',gen_random_uuid(),auth.uid(),actor);end if;
 end loop;
 if p_consume and p_s.stock_lines<>'[]'::jsonb then insert into shop_supplement_stock_settlements(supplement_id,recorded_by) values(p_s.id,auth.uid());end if;
end;$$;
revoke all on function public.reconcile_supplement_stock(public.shop_supplemental_estimates,boolean,boolean,boolean) from public,anon,authenticated;

create or replace function public.guard_supplement_stock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;changed boolean;
begin
 select * into ro from shop_repair_orders where id=new.repair_order_id for update;
 if ro.shop_id is distinct from new.shop_id then raise exception 'Supplement shop mismatch.';end if;
 changed:=case when tg_op='INSERT' then new.stock_lines<>'[]'::jsonb else new.stock_lines is distinct from old.stock_lines end;
 if changed and (not public.shop_has_permission(ro.shop_id,'repair_orders.write') or not public.shop_inventory_can(ro.shop_id,'read')) then raise exception 'Office estimate and inventory access is required.';end if;
 if changed and (ro.status in ('Ready for Payment','Ready for Pickup','Complete') or exists(select 1 from shop_supplement_stock_settlements where supplement_id=new.id)) then raise exception 'Save stocked supplement revisions before Ready for Payment; consumed lines are locked.';end if;
 perform public.reconcile_supplement_stock(new,not ro.archived and ro.status not in ('Cancelled','Canceled','Complete') and ro.estimate_approval_status<>'Declined' and new.status<>'Declined',false,changed);
 return new;
end;$$;
revoke all on function public.guard_supplement_stock() from public,anon,authenticated;
drop trigger if exists supplement_stock_holds on public.shop_supplemental_estimates;
create trigger supplement_stock_holds after insert or update on public.shop_supplemental_estimates for each row execute function public.guard_supplement_stock();

create or replace function public.supplement_stock_manifest(p_ro uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'number',s.supplement_number,'revision',s.revision,'lines',s.stock_lines) order by s.id),'[]'::jsonb)
 from shop_supplemental_estimates s where repair_order_id=p_ro and status='Approved' and stock_lines<>'[]'::jsonb
 and not exists(select 1 from shop_supplement_stock_settlements where supplement_id=s.id);
$$;
revoke all on function public.supplement_stock_manifest(uuid) from public,anon,authenticated;
create or replace function public.get_shop_supplement_stock(p_ro uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;
begin
 select * into ro from shop_repair_orders where id=p_ro;
 if ro.id is null or not public.shop_can_access_ro(ro.shop_id,ro.id::text,'work') then raise exception 'Repair order is unavailable.';end if;
 return public.supplement_stock_manifest(p_ro);
end;$$;
create or replace function public.confirm_shop_all_ro_stock(p_ro uuid,p_baseline jsonb,p_supplements jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.confirm_shop_ro_stock(p_ro,p_baseline);
 if public.supplement_stock_manifest(p_ro) is distinct from p_supplements then raise exception 'Supplement stock changed. Refresh and review before confirming.';end if;
 insert into shop_supplement_stock_confirmations values(p_ro,auth.uid(),p_supplements,now()) on conflict(repair_order_id,user_id) do update set manifest=excluded.manifest,recorded_at=excluded.recorded_at;
end;$$;
revoke all on function public.get_shop_supplement_stock(uuid),public.confirm_shop_all_ro_stock(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.get_shop_supplement_stock(uuid),public.confirm_shop_all_ro_stock(uuid,jsonb,jsonb) to authenticated;

create or replace function public.reconcile_ro_supplement_stock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.shop_supplemental_estimates;expected_manifest jsonb;ready boolean;wanted boolean;
begin
 ready:=new.status='Ready for Payment' and old.status is distinct from new.status;
 wanted:=not new.archived and new.status not in ('Cancelled','Canceled','Complete') and new.estimate_approval_status<>'Declined';
 expected_manifest:=public.supplement_stock_manifest(new.id);
 if ready and exists(select 1 from shop_supplemental_estimates where repair_order_id=new.id and status in ('Draft','Sent')) then raise exception 'Approve or decline pending supplemental estimates before Ready for Payment.';end if;
 if ready and expected_manifest<>'[]'::jsonb then
  if not wanted then raise exception 'Declined or archived stocked work cannot be consumed.';end if;
  if not exists(select 1 from shop_supplement_stock_confirmations c where c.repair_order_id=new.id and c.user_id=auth.uid() and c.manifest=expected_manifest and recorded_at>now()-interval '5 minutes') then raise exception 'Review and confirm supplemental stocked parts before Ready for Payment.';end if;
 end if;
 if new.status='Complete' and old.status is distinct from new.status and exists(select 1 from shop_supplemental_estimates se where se.repair_order_id=new.id and se.stock_lines<>'[]'::jsonb and se.status<>'Declined' and not exists(select 1 from shop_supplement_stock_settlements st where st.supplement_id=se.id)) then raise exception 'Confirm Ready for Payment before completing stocked supplements.';end if;
 for s in select * from shop_supplemental_estimates where repair_order_id=new.id order by id loop
  perform public.reconcile_supplement_stock(s,wanted and s.status<>'Declined',ready and s.status='Approved',false);
 end loop;
 if ready then delete from shop_supplement_stock_confirmations where repair_order_id=new.id;end if;
 return new;
end;$$;
revoke all on function public.reconcile_ro_supplement_stock() from public,anon,authenticated;
drop trigger if exists b_supplement_stock on public.shop_repair_orders;
create trigger b_supplement_stock before update on public.shop_repair_orders for each row execute function public.reconcile_ro_supplement_stock();
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
 if new.status='Ready for Payment' and old.status is distinct from new.status and new.approval_request is not null then raise exception 'Save authorization before moving to Ready for Payment.';end if;
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
  select coalesce(sum(hold_delta),0) into oldqty from shop_ro_stock_events where repair_order_id=new.id and item_id=item.id and supplement_id is null;
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
create or replace function public.return_shop_ro_stock(p_ro uuid,p_item uuid,p_quantity numeric,p_reason text,p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;previous public.shop_ro_stock_events;remaining numeric;actor text;
begin
 select * into ro from shop_repair_orders where id=p_ro for update;
 if ro.id is null or not public.shop_inventory_can(ro.shop_id,'manage') then raise exception 'Inventory management access is required.';end if;
 if p_request is null or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,3) or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'Enter a positive return quantity and reason.';end if;
 select * into previous from shop_ro_stock_events where shop_id=ro.shop_id and request_id=p_request and item_id=p_item;
 if previous.id is not null then
  if previous.repair_order_id<>p_ro or previous.supplement_id is not null or previous.kind<>'return' or previous.stock_delta<>p_quantity or previous.reason<>trim(p_reason) or previous.recorded_by<>auth.uid() then raise exception 'Return request already used with different details.';end if;
  return;
 end if;
 perform 1 from shop_inventory_items where shop_id=ro.shop_id and id=p_item for update;
 select -coalesce(sum(stock_delta),0) into remaining from shop_ro_stock_events where repair_order_id=p_ro and item_id=p_item and supplement_id is null and kind in ('consume','return');
 if p_quantity>remaining then raise exception 'Return exceeds consumed quantity remaining: %.',remaining;end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into shop_ro_stock_events(shop_id,repair_order_id,item_id,stock_delta,kind,reason,request_id,recorded_by,recorded_by_email)
 values(ro.shop_id,p_ro,p_item,p_quantity,'return',trim(p_reason),p_request,auth.uid(),actor);
end $$;
revoke all on function public.return_shop_ro_stock(uuid,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.return_shop_ro_stock(uuid,uuid,numeric,text,uuid) to authenticated;
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
  insert into public.shop_supplemental_estimates(shop_id,repair_order_id,supplement_number,description,labor_hours,labor_rate,parts_total,other_charges,other_taxable,discount,total,notes,status,created_by,stock_lines)
  values(ro.shop_id,p_ro,(select coalesce(max(supplement_number),0)+1 from public.shop_supplemental_estimates where repair_order_id=p_ro),description_value,hours_value,rate_value,parts_value,other_value,coalesce((p_estimate->>'other_taxable')::boolean,false),discount_value,total_value,coalesce(p_estimate->>'notes',''),coalesce(p_estimate->>'status','Draft'),auth.uid(),coalesce(p_estimate->'stock_lines','[]'::jsonb)) returning * into result;
 else
  select * into previous from public.shop_supplemental_estimates where id=p_id and repair_order_id=p_ro and shop_id=ro.shop_id;
  if previous.id is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Supplement changed. Refresh and review before saving.'; end if;
  changed:=row(previous.description,previous.labor_hours,previous.labor_rate,previous.parts_total,previous.other_charges,previous.other_taxable,previous.discount,previous.notes,previous.stock_lines) is distinct from row(description_value,hours_value,rate_value,parts_value,other_value,coalesce((p_estimate->>'other_taxable')::boolean,false),discount_value,coalesce(p_estimate->>'notes',''),coalesce(p_estimate->'stock_lines',previous.stock_lines));
  changed:=changed or (previous.status='Approved' and p_estimate->>'status'='Declined');
  update public.shop_supplemental_estimates set description=description_value,labor_hours=hours_value,labor_rate=rate_value,parts_total=parts_value,other_charges=other_value,other_taxable=coalesce((p_estimate->>'other_taxable')::boolean,false),discount=discount_value,total=total_value,notes=coalesce(p_estimate->>'notes',''),revision=previous.revision+case when changed then 1 else 0 end,
   stock_lines=coalesce(p_estimate->'stock_lines',previous.stock_lines),status=case when coalesce(p_estimate->>'status','Draft')='Declined' then 'Declined' when changed then 'Draft' when previous.status='Approved' then 'Approved' else coalesce(p_estimate->>'status','Draft') end,updated_at=clock_timestamp() where id=p_id returning * into result;
 end if;
 return result;
end; $$;

create or replace function public.approve_shop_supplement(p_id uuid,p_expected_updated_at timestamptz,p_revision integer,p_authorization jsonb)
returns public.shop_supplemental_estimates language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders; supplement public.shop_supplemental_estimates; actor_email text; file_path text; financials jsonb;
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
 financials:=public.shop_supplement_authorization_totals(to_jsonb(supplement),to_jsonb(ro));
 if coalesce(p_authorization->>'expected_total','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (p_authorization->>'expected_total')::numeric is distinct from (financials->>'total')::numeric then raise exception 'Supplement tax or total changed. Reload and review authorization.';end if;
 select coalesce(email,'') into actor_email from auth.users where id=auth.uid();
 insert into public.shop_supplement_authorizations(shop_id,repair_order_id,supplement_id,revision,estimate_snapshot,authorized_amount,method,customer_contact,notes,evidence_path,evidence_name,recorded_by,recorded_by_email)
 values(ro.shop_id,ro.id,p_id,supplement.revision,to_jsonb(supplement)||jsonb_build_object('authorization_tax_snapshot',financials),(financials->>'total')::numeric,p_authorization->>'method',trim(p_authorization->>'customer_contact'),coalesce(p_authorization->>'notes',''),file_path,nullif(p_authorization->>'evidence_name',''),auth.uid(),coalesce(actor_email,''));
 update public.shop_supplemental_estimates set status='Approved',updated_at=clock_timestamp() where id=p_id returning * into supplement;
 if ro.status in ('Open','Intake','Scheduled','Waiting Approval','Needs Info') then update public.shop_repair_orders set status='In Progress' where id=ro.id; end if;
 return supplement;
end; $$;


create or replace function public.return_shop_supplement_stock(p_supplement uuid,p_item uuid,p_quantity numeric,p_reason text,p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ro public.shop_repair_orders;s public.shop_supplemental_estimates;previous public.shop_ro_stock_events;remaining numeric;actor text;reason_value text;
begin
 select r.* into ro from shop_repair_orders r join shop_supplemental_estimates se on se.repair_order_id=r.id where se.id=p_supplement for update of r;
 if ro.id is null or not public.shop_inventory_can(ro.shop_id,'manage') then raise exception 'Inventory management access is required.';end if;
 select * into s from shop_supplemental_estimates where id=p_supplement and shop_id=ro.shop_id;
 if p_request is null or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,3) or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'Enter a positive return quantity and reason.';end if;
 reason_value:='Supplement '||s.supplement_number||' · '||trim(p_reason);
 select * into previous from shop_ro_stock_events where shop_id=ro.shop_id and request_id=p_request and item_id=p_item;
 if previous.id is not null then
  if previous.supplement_id is distinct from p_supplement or previous.kind<>'return' or previous.stock_delta<>p_quantity or previous.reason<>reason_value or previous.recorded_by<>auth.uid() then raise exception 'Return request already used with different details.';end if;
  return;
 end if;
 perform 1 from shop_inventory_items where shop_id=ro.shop_id and id=p_item for update;
 select -coalesce(sum(stock_delta),0) into remaining from shop_ro_stock_events where supplement_id=p_supplement and item_id=p_item and kind in ('consume','return');
 if p_quantity>remaining then raise exception 'Return exceeds consumed supplement quantity remaining: %.',remaining;end if;
 select coalesce(email,'') into actor from auth.users where id=auth.uid();
 insert into shop_ro_stock_events(shop_id,repair_order_id,supplement_id,item_id,stock_delta,kind,reason,request_id,recorded_by,recorded_by_email)
 values(ro.shop_id,ro.id,p_supplement,p_item,p_quantity,'return',reason_value,p_request,auth.uid(),actor);
end $$;
revoke all on function public.return_shop_supplement_stock(uuid,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.return_shop_supplement_stock(uuid,uuid,numeric,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
