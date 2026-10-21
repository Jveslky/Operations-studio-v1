-- Apply to Test first. Requires shop permissions, RO estimates and inventory.
begin;
create table if not exists public.shop_prebuilt_jobs (
 id uuid primary key,shop_id uuid not null references public.shops(id),definition jsonb not null,
 version integer not null default 1,archived boolean not null default false,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(shop_id,id)
);
create table if not exists public.shop_prebuilt_job_saves (
 shop_id uuid not null references public.shops(id),request_id uuid not null,template_id uuid not null references public.shop_prebuilt_jobs(id),
 payload jsonb not null,result jsonb not null,actor uuid not null references auth.users(id),recorded_at timestamptz not null default now(),primary key(shop_id,request_id)
);
alter table public.shop_prebuilt_jobs enable row level security;
alter table public.shop_prebuilt_job_saves enable row level security;
revoke all on public.shop_prebuilt_jobs,public.shop_prebuilt_job_saves from public,anon,authenticated;
grant select on public.shop_prebuilt_jobs to authenticated;
drop policy if exists prebuilt_read on public.shop_prebuilt_jobs;
create policy prebuilt_read on public.shop_prebuilt_jobs for select to authenticated using (
 public.has_shop_role(shop_id,array['owner','admin','service_writer']) and public.shop_has_permission(shop_id,'repair_orders.write')
);
create or replace function public.save_shop_prebuilt_job(p_shop uuid,p_id uuid,p_request uuid,p_expected integer,p_definition jsonb,p_archived boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare oldrow public.shop_prebuilt_jobs; saved public.shop_prebuilt_job_saves; payload jsonb; result jsonb; line jsonb; key text; n numeric;
begin
 if auth.uid() is null or not public.has_shop_role(p_shop,array['owner','admin']) or not public.shop_has_permission(p_shop,'settings.manage') then raise exception 'Shop settings access is required.';end if;
 if p_id is null or p_request is null or p_archived is null then raise exception 'Missing save identity.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,8821));
 payload:=jsonb_build_object('id',p_id,'expected',p_expected,'definition',p_definition,'archived',p_archived);
 select * into saved from shop_prebuilt_job_saves where shop_id=p_shop and request_id=p_request;
 if found then
  if saved.payload is distinct from payload or saved.actor<>auth.uid() then raise exception 'Save request already used.';end if;
  return saved.result;
 end if;
 select * into oldrow from shop_prebuilt_jobs where id=p_id for update;
 if found and (oldrow.shop_id<>p_shop or oldrow.version is distinct from p_expected) then raise exception 'Template changed or unavailable. Refresh before saving.';end if;
 if oldrow.id is null and p_expected is not null then raise exception 'Template no longer available.';end if;
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>80000
 or coalesce(length(trim(p_definition->>'name')),0) not between 1 and 150
 or coalesce(p_definition->>'mode','') not in ('flat','itemized','mixed')
 or coalesce(p_definition->>'labor_pricing','') not in ('included','hours')
 or jsonb_typeof(p_definition->'lines') is distinct from 'array' then raise exception 'Invalid job definition.';end if;
 if jsonb_array_length(p_definition->'lines')>50 then raise exception 'At most 50 parts per job.';end if;
 foreach key in array array['base_price','labor_hours'] loop
  if coalesce(p_definition->>key,'')!~'^[0-9]+([.][0-9]{1,3})?$' then raise exception 'Invalid price or hours.';end if;
  n:=(p_definition->>key)::numeric;if n>9999999 or (key='base_price' and n<>round(n,2)) then raise exception 'Invalid price or hours.';end if;
 end loop;
 for line in select value from jsonb_array_elements(p_definition->'lines') loop
  if coalesce(length(trim(line->>'description')),0) not between 1 and 500 or coalesce(line->>'pricing','') not in ('included','difference','itemized') then raise exception 'Invalid part.';end if;
  foreach key in array array['quantity','included_quantity','unit_price','allowance','extra_price'] loop
   if coalesce(line->>key,'')!~'^[0-9]+([.][0-9]{1,3})?$' then raise exception 'Invalid part quantity or price.';end if;
   n:=(line->>key)::numeric;if n>9999999 or (key='quantity' and n<=0) or (key in ('unit_price','allowance','extra_price') and n<>round(n,2)) then raise exception 'Invalid part quantity or price.';end if;
  end loop;
  if nullif(line->>'item_id','') is not null and not exists(select 1 from shop_inventory_items where shop_id=p_shop and id=(line->>'item_id')::uuid and not archived) then raise exception 'Stocked part is unavailable in this shop.';end if;
 end loop;
 insert into shop_prebuilt_jobs(id,shop_id,definition,version,archived,updated_by) values(p_id,p_shop,p_definition,coalesce(oldrow.version,0)+1,p_archived,auth.uid())
 on conflict(id) do update set definition=excluded.definition,version=excluded.version,archived=excluded.archived,updated_by=excluded.updated_by,updated_at=now()
 returning to_jsonb(shop_prebuilt_jobs.*) into result;
 insert into shop_prebuilt_job_saves values(p_shop,p_request,p_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.save_shop_prebuilt_job(uuid,uuid,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_shop_prebuilt_job(uuid,uuid,uuid,integer,jsonb,boolean) to authenticated;
alter table public.shop_repair_orders add column if not exists prebuilt_expected_updated_at timestamptz;
alter table public.shop_repair_orders add column if not exists estimate_prebuilt_jobs jsonb not null default '[]';
alter table public.shop_repair_orders drop constraint if exists prebuilt_snapshot_array;
alter table public.shop_repair_orders add constraint prebuilt_snapshot_array check(jsonb_typeof(estimate_prebuilt_jobs)='array' and jsonb_array_length(estimate_prebuilt_jobs)<=100 and octet_length(estimate_prebuilt_jobs::text)<=200000);
create or replace function public.guard_prebuilt_snapshot() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if new.estimate_prebuilt_jobs<>'[]'::jsonb then raise exception 'Create the RO before adding prebuilts.';end if;
 elsif new.estimate_prebuilt_jobs is distinct from old.estimate_prebuilt_jobs then
  if new.prebuilt_expected_updated_at is distinct from old.updated_at then raise exception 'RO changed. Refresh before adding a prebuilt.';end if;
  if not public.has_shop_role(new.shop_id,array['owner','admin','service_writer']) or not public.shop_has_permission(new.shop_id,'repair_orders.write') then raise exception 'Office estimate access is required.';end if;
  if exists(select 1 from public.shop_invoices where repair_order_id=new.id) then raise exception 'Invoiced jobs are locked.';end if;
 end if;new.prebuilt_expected_updated_at:=null;return new;
end $$;
drop trigger if exists guard_prebuilt_snapshot on public.shop_repair_orders;
create trigger guard_prebuilt_snapshot before insert or update on public.shop_repair_orders for each row execute function public.guard_prebuilt_snapshot();
create or replace function public.capture_prebuilt_invoice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare jobs jsonb;
begin
 if tg_op='INSERT' and new.repair_order_id is not null then
  select estimate_prebuilt_jobs into jobs from public.shop_repair_orders where id=new.repair_order_id and shop_id=new.shop_id;
  if jobs is not null and jobs<>'[]'::jsonb then new.fee_snapshot:=coalesce(new.fee_snapshot,'{}'::jsonb)||jsonb_build_object('prebuiltJobs',jobs);end if;
 elsif tg_op='UPDATE' and old.fee_snapshot ? 'prebuiltJobs' then
  new.fee_snapshot:=coalesce(new.fee_snapshot,'{}'::jsonb)||jsonb_build_object('prebuiltJobs',old.fee_snapshot->'prebuiltJobs');
 end if;return new;
end $$;
drop trigger if exists zy_prebuilt_invoice on public.shop_invoices;
create trigger zy_prebuilt_invoice before insert or update on public.shop_invoices for each row execute function public.capture_prebuilt_invoice();
commit;
