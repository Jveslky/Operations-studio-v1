-- Live QA assignment revocation, phase 1. Project: amikoqrqutnpojtcyjlx.
-- Run whole file before merging PR #87. No fixtures, deletes or media-byte changes.
-- Enforces only TRQ&A and 2TRQ&A. Other shops retain installed access behavior.
begin;
create or replace function public.live_qa_assignment_scope(target_shop uuid)
returns boolean language sql immutable set search_path=public as $$
 select coalesce(target_shop in ('b40cf910-b4df-4558-bb46-1eb18a4f4cb8'::uuid,
 '322f19e9-f0ce-492e-ada7-9f3298c16376'::uuid),false);
$$;
create or replace function public.live_qa_assignment_path_scope(object_name text)
returns boolean language sql immutable set search_path=public as $$
 select split_part(object_name,'/',1) in ('b40cf910-b4df-4558-bb46-1eb18a4f4cb8',
 '322f19e9-f0ce-492e-ada7-9f3298c16376');
$$;
do $$ begin
 if not exists(select 1 from public.shops where id='b40cf910-b4df-4558-bb46-1eb18a4f4cb8' and name='TRQ&A')
 or not exists(select 1 from public.shops where id='322f19e9-f0ce-492e-ada7-9f3298c16376' and name='2TRQ&A')
 or not exists(select 1 from storage.buckets where id='shop-inspection-media' and public=false) then
  raise exception 'STOP: expected Live QA shops and private inspection bucket';
 end if;
 if exists(select 1 from public.shop_repair_orders r where public.live_qa_assignment_scope(shop_id)
  and ((coalesce(trim(technician),'') not in ('','Unassigned') and not exists(
   select 1 from public.shop_members m join auth.users u on u.id=m.user_id
   where m.shop_id=r.shop_id and m.is_active and m.role in ('owner','admin','service_writer','technician') and lower(u.email)=lower(trim(r.technician))))
  or (coalesce(trim(additional_technician),'') not in ('','Unassigned') and not exists(
   select 1 from public.shop_members m join auth.users u on u.id=m.user_id
   where m.shop_id=r.shop_id and m.is_active and m.role in ('owner','admin','service_writer','technician') and lower(u.email)=lower(trim(r.additional_technician)))))) then
  raise exception 'STOP: QA assignment labels changed since audit';
 end if;
end $$;
-- Transaction-local fingerprint: abort if any non-QA RO business record changes.
create temporary table live_assignment_protected_before on commit drop as
select md5(coalesce(string_agg((to_jsonb(r)-'technician_user_id'-'additional_technician_user_id')::text,'|' order by id),'')) fingerprint
from public.shop_repair_orders r where not public.live_qa_assignment_scope(shop_id);

-- Assignment labels remain readable; authorization uses immutable Auth user IDs.
alter table public.shop_repair_orders add column if not exists technician_user_id uuid references auth.users(id) on delete restrict;
alter table public.shop_repair_orders add column if not exists additional_technician_user_id uuid references auth.users(id) on delete restrict;
create index if not exists shop_ro_primary_assignment on public.shop_repair_orders(shop_id,technician_user_id);
create index if not exists shop_ro_additional_assignment on public.shop_repair_orders(shop_id,additional_technician_user_id);
create or replace function public.resolve_shop_assignment(target_shop uuid, label text)
returns uuid language sql stable security definer set search_path=public as $$
 select m.user_id from public.shop_members m join auth.users u on u.id=m.user_id
 where m.shop_id=target_shop and m.is_active and m.role in ('owner','admin','service_writer','technician')
 and lower(u.email)=lower(trim(label)) limit 1;
$$;
drop trigger if exists shop_ro_assignment_identity on public.shop_repair_orders;
-- Existing non-email labels fail closed. Review unresolved labels after migration.
update public.shop_repair_orders set
 technician_user_id=public.resolve_shop_assignment(shop_id,technician),
 additional_technician_user_id=public.resolve_shop_assignment(shop_id,additional_technician)
where public.live_qa_assignment_scope(shop_id)
 and (technician_user_id is distinct from public.resolve_shop_assignment(shop_id,technician)
 or additional_technician_user_id is distinct from public.resolve_shop_assignment(shop_id,additional_technician));

create or replace function public.shop_can_access_ro(target_shop uuid, reference text, action text default 'read')
returns boolean language plpgsql stable security definer set search_path=public as $$
declare r public.shop_repair_orders; member_role text; matches integer; lookup_id uuid; lookup_number bigint;
begin
 select role into member_role from public.shop_members
 where shop_id=target_shop and user_id=auth.uid() and is_active;
 if member_role is null then return false; end if;
 -- Outside QA, preserve the installed membership/role behavior.
 if not public.live_qa_assignment_scope(target_shop) then
  return case action when 'read' then public.is_shop_member(target_shop)
   when 'work' then public.has_shop_role(target_shop,array['owner','admin','service_writer','technician'])
   when 'inspection' then public.has_shop_role(target_shop,array['owner','admin','service_writer','technician'])
   else false end;
 end if;
 if reference ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then lookup_id:=reference::uuid; end if;
 if reference ~ '^[0-9]{1,19}$' then
  begin lookup_number:=reference::bigint; exception when numeric_value_out_of_range then return false; end;
 end if;
 select count(*) into matches from public.shop_repair_orders
 where shop_id=target_shop and (id=lookup_id or ro_number=lookup_number or legacy_local_id=reference);
 if matches<>1 then return false; end if;
 select * into r from public.shop_repair_orders
 where shop_id=target_shop and (id=lookup_id or ro_number=lookup_number or legacy_local_id=reference);
 if member_role='technician' and not coalesce(auth.uid() in (r.technician_user_id,r.additional_technician_user_id),false) then return false; end if;
 return case action
 when 'read' then public.shop_has_permission(target_shop,'repair_orders.read')
 when 'work' then public.shop_has_permission(target_shop,'repair_orders.update_work')
 when 'inspection' then public.shop_has_permission(target_shop,'inspections.work')
 when 'assign' then member_role<>'technician' and public.shop_has_permission(target_shop,'repair_orders.write')
 else false end;
end $$;

create or replace function public.sync_shop_ro_assignments()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.live_qa_assignment_scope(new.shop_id) then return new; end if;
 if tg_op='INSERT' or new.technician is distinct from old.technician or new.additional_technician is distinct from old.additional_technician
 or new.technician_user_id is distinct from old.technician_user_id or new.additional_technician_user_id is distinct from old.additional_technician_user_id then
  if not public.shop_has_permission(new.shop_id,'repair_orders.write') then raise exception 'Assignment permission required'; end if;
  new.technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.technician);
  new.additional_technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.additional_technician);
  if trim(new.technician) not in ('','Unassigned') and new.technician_user_id is null then raise exception 'Primary technician must be active in this shop'; end if;
  if trim(new.additional_technician) not in ('','Unassigned') and new.additional_technician_user_id is null then raise exception 'Additional technician must be active in this shop'; end if;
 end if;
 return new;
end $$;
drop trigger if exists shop_ro_assignment_identity on public.shop_repair_orders;
create trigger shop_ro_assignment_identity before insert or update on public.shop_repair_orders
 for each row execute function public.sync_shop_ro_assignments();

-- RESTRICTIVE policies AND with existing permissive policies, closing legacy OR bypasses.
drop policy if exists "assigned ro read boundary" on public.shop_repair_orders;
create policy "assigned ro read boundary" on public.shop_repair_orders as restrictive for select to authenticated
 using (
  not public.live_qa_assignment_scope(shop_id) or (public.shop_has_permission(shop_id,'repair_orders.read')
  and (
   not public.has_shop_role(shop_id,array['technician'])
   or coalesce(auth.uid() in (technician_user_id,additional_technician_user_id),false)
  ))
 );
drop policy if exists "office direct ro update boundary" on public.shop_repair_orders;
create policy "office direct ro update boundary" on public.shop_repair_orders as restrictive for update to authenticated
 using(not public.live_qa_assignment_scope(shop_id) or public.shop_has_permission(shop_id,'repair_orders.write')) with check(not public.live_qa_assignment_scope(shop_id) or public.shop_has_permission(shop_id,'repair_orders.write'));

create or replace function public.update_shop_repair_order_work(
    target_id uuid,
    new_status text,
    new_technician_notes text,
    new_labor_hours numeric,
    new_additional_work text
)
returns public.shop_repair_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.shop_repair_orders;
begin
    select * into target
    from public.shop_repair_orders
    where id = target_id for update;

    if target.id is null or not public.shop_can_access_ro(target.shop_id,target.id::text,'work') then
        raise exception 'Repair order is unavailable.';
    end if;

    update public.shop_repair_orders
    set status = coalesce(new_status, status),
        technician_notes = coalesce(new_technician_notes, technician_notes),
        labor_hours = greatest(coalesce(new_labor_hours, labor_hours), 0),
        additional_work_performed = coalesce(new_additional_work, additional_work_performed)
    where id = target_id
    returning * into target;

    return target;
end;
$$;

-- Inspection scope cannot be moved to another RO after creation, even by a definer RPC.
create or replace function public.guard_shop_ro_child()
returns trigger language plpgsql security definer set search_path=public as $$
declare ref text; parent public.shop_inspections; oldrow jsonb;
begin
 if not public.live_qa_assignment_scope(new.shop_id) then return new; end if;
 if tg_op='UPDATE' then
  oldrow:=to_jsonb(old);
  if oldrow->'shop_id' is distinct from to_jsonb(new)->'shop_id'
  or oldrow->'repair_order_id' is distinct from to_jsonb(new)->'repair_order_id'
  or oldrow->'inspection_id' is distinct from to_jsonb(new)->'inspection_id'
  or oldrow->'object_path' is distinct from to_jsonb(new)->'object_path' then raise exception 'Service record scope is immutable'; end if;
 end if;
 if tg_table_name='shop_inspection_items' then
  select * into parent from public.shop_inspections where id=new.inspection_id and shop_id=new.shop_id;
  ref:=parent.repair_order_id;
 else ref:=new.repair_order_id; end if;
 if not public.shop_can_access_ro(new.shop_id,ref,'inspection') then raise exception 'Assigned inspection access required'; end if;
 if tg_table_name='shop_ro_media' then
  if split_part(new.object_path,'/',1)<>new.shop_id::text or split_part(new.object_path,'/',2)<>new.repair_order_id then
   raise exception 'Photo path does not match its repair order'; end if;
 end if;
 return new;
end $$;
drop trigger if exists assigned_ro_scope_guard on public.shop_inspections;
create trigger assigned_ro_scope_guard before insert or update on public.shop_inspections for each row execute function public.guard_shop_ro_child();
drop policy if exists "assigned ro child read boundary" on public.shop_inspections;
create policy "assigned ro child read boundary" on public.shop_inspections as restrictive for select to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'read'));
drop policy if exists "assigned ro child insert boundary" on public.shop_inspections;
create policy "assigned ro child insert boundary" on public.shop_inspections as restrictive for insert to authenticated with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop policy if exists "assigned ro child update boundary" on public.shop_inspections;
create policy "assigned ro child update boundary" on public.shop_inspections as restrictive for update to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection')) with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop policy if exists "assigned ro child delete boundary" on public.shop_inspections;
create policy "assigned ro child delete boundary" on public.shop_inspections as restrictive for delete to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop trigger if exists assigned_ro_scope_guard on public.shop_ro_media;
create trigger assigned_ro_scope_guard before insert or update on public.shop_ro_media for each row execute function public.guard_shop_ro_child();
drop policy if exists "assigned ro child read boundary" on public.shop_ro_media;
create policy "assigned ro child read boundary" on public.shop_ro_media as restrictive for select to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'read'));
drop policy if exists "assigned ro child insert boundary" on public.shop_ro_media;
create policy "assigned ro child insert boundary" on public.shop_ro_media as restrictive for insert to authenticated with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop policy if exists "assigned ro child update boundary" on public.shop_ro_media;
create policy "assigned ro child update boundary" on public.shop_ro_media as restrictive for update to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection')) with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop policy if exists "assigned ro child delete boundary" on public.shop_ro_media;
create policy "assigned ro child delete boundary" on public.shop_ro_media as restrictive for delete to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,repair_order_id,'inspection'));
drop trigger if exists assigned_ro_scope_guard on public.shop_inspection_items;
create trigger assigned_ro_scope_guard before insert or update on public.shop_inspection_items for each row execute function public.guard_shop_ro_child();
drop policy if exists "assigned ro child read boundary" on public.shop_inspection_items;
create policy "assigned ro child read boundary" on public.shop_inspection_items as restrictive for select to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,(select i.repair_order_id from public.shop_inspections i where i.id=inspection_id and i.shop_id=shop_inspection_items.shop_id),'read'));
drop policy if exists "assigned ro child insert boundary" on public.shop_inspection_items;
create policy "assigned ro child insert boundary" on public.shop_inspection_items as restrictive for insert to authenticated with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,(select i.repair_order_id from public.shop_inspections i where i.id=inspection_id and i.shop_id=shop_inspection_items.shop_id),'inspection'));
drop policy if exists "assigned ro child update boundary" on public.shop_inspection_items;
create policy "assigned ro child update boundary" on public.shop_inspection_items as restrictive for update to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,(select i.repair_order_id from public.shop_inspections i where i.id=inspection_id and i.shop_id=shop_inspection_items.shop_id),'inspection')) with check(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,(select i.repair_order_id from public.shop_inspections i where i.id=inspection_id and i.shop_id=shop_inspection_items.shop_id),'inspection'));
drop policy if exists "assigned ro child delete boundary" on public.shop_inspection_items;
create policy "assigned ro child delete boundary" on public.shop_inspection_items as restrictive for delete to authenticated using(not public.live_qa_assignment_scope(shop_id) or public.shop_can_access_ro(shop_id,(select i.repair_order_id from public.shop_inspections i where i.id=inspection_id and i.shop_id=shop_inspection_items.shop_id),'inspection'));
create or replace function public.attach_shop_inspection(requested_repair_order_id text, requested_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_shop_id uuid; new_inspection_id uuid; template_name text;
begin
    select shop_id into current_shop_id from public.shop_members where user_id=auth.uid() and is_active=true and role in ('owner','admin','service_writer','technician') limit 1;
    if current_shop_id is null then raise exception 'Workflow access required'; end if;
    if public.live_qa_assignment_scope(current_shop_id) and not public.shop_can_access_ro(current_shop_id,requested_repair_order_id,'inspection') then raise exception 'Assigned inspection access required'; end if;
    if requested_template_id is not null then select name into template_name from public.shop_inspection_templates where id=requested_template_id and shop_id=current_shop_id and is_archived=false; if template_name is null then raise exception 'Active template not found'; end if; end if;
    insert into public.shop_inspections(shop_id,repair_order_id,template_id,title,status,created_by) values(current_shop_id,requested_repair_order_id,requested_template_id,coalesce(template_name,'General Inspection'),'draft',auth.uid()) returning id into new_inspection_id;
    if requested_template_id is not null then
        insert into public.shop_inspection_items(shop_id,inspection_id,template_item_id,section_title,item_label,is_required,sort_order,response_set_name,response_options)
        select current_shop_id,new_inspection_id,items.id,sections.title,items.label,items.is_required,sections.sort_order*10000+items.sort_order,coalesce(sets.name,'Standard'),
        coalesce((select jsonb_agg(jsonb_build_object('label',options.label,'meaning',options.meaning) order by options.sort_order) from public.shop_inspection_response_options options where options.response_set_id=items.response_set_id),'[{"label":"Pass","meaning":"positive"},{"label":"Attention","meaning":"attention"},{"label":"Fail","meaning":"critical"},{"label":"N/A","meaning":"na"}]'::jsonb)
        from public.shop_inspection_template_items items join public.shop_inspection_template_sections sections on sections.id=items.section_id left join public.shop_inspection_response_sets sets on sets.id=items.response_set_id where items.template_id=requested_template_id;
    end if; return new_inspection_id;
end; $$;

create or replace function public.shop_can_access_ro_file(object_name text,action text default 'read')
returns boolean language plpgsql stable security definer set search_path=public as $$
declare shop_text text:=split_part(object_name,'/',1); ref text:=split_part(object_name,'/',2);
begin
 if shop_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or ref='' then return false; end if;
 return public.shop_can_access_ro(shop_text::uuid,ref,action);
end $$;
-- Keep existing permissive bucket policies. Add QA-only restrictive boundaries.
drop policy if exists "assigned ro photo select boundary" on storage.objects;
create policy "assigned ro photo select boundary" on storage.objects as restrictive for select to authenticated using(bucket_id<>'shop-inspection-media' or not public.live_qa_assignment_path_scope(name) or public.shop_can_access_ro_file(name,'read'));
drop policy if exists "assigned ro photo insert boundary" on storage.objects;
create policy "assigned ro photo insert boundary" on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'shop-inspection-media' or not public.live_qa_assignment_path_scope(name) or public.shop_can_access_ro_file(name,'inspection'));
drop policy if exists "assigned ro photo update boundary" on storage.objects;
create policy "assigned ro photo update boundary" on storage.objects as restrictive for update to authenticated using(bucket_id<>'shop-inspection-media' or not public.live_qa_assignment_path_scope(name) or public.shop_can_access_ro_file(name,'inspection')) with check(bucket_id<>'shop-inspection-media' or not public.live_qa_assignment_path_scope(name) or public.shop_can_access_ro_file(name,'inspection'));
drop policy if exists "assigned ro photo delete boundary" on storage.objects;
create policy "assigned ro photo delete boundary" on storage.objects as restrictive for delete to authenticated using(bucket_id<>'shop-inspection-media' or not public.live_qa_assignment_path_scope(name) or public.shop_can_access_ro_file(name,'inspection'));

revoke all on function public.resolve_shop_assignment(uuid,text) from public,anon,authenticated;
revoke all on function public.sync_shop_ro_assignments() from public,anon,authenticated;
revoke all on function public.guard_shop_ro_child() from public,anon,authenticated;
revoke all on function public.shop_can_access_ro(uuid,text,text) from public,anon;
grant execute on function public.shop_can_access_ro(uuid,text,text) to authenticated;
revoke all on function public.shop_can_access_ro_file(text,text) from public,anon;
grant execute on function public.shop_can_access_ro_file(text,text) to authenticated;
revoke all on function public.update_shop_repair_order_work(uuid,text,text,numeric,text) from public,anon;
grant execute on function public.update_shop_repair_order_work(uuid,text,text,numeric,text) to authenticated;
revoke all on function public.attach_shop_inspection(text,uuid) from public,anon;
grant execute on function public.attach_shop_inspection(text,uuid) to authenticated;
do $$ declare after_fingerprint text; begin
 select md5(coalesce(string_agg((to_jsonb(r)-'technician_user_id'-'additional_technician_user_id')::text,'|' order by id),''))
 into after_fingerprint from public.shop_repair_orders r where not public.live_qa_assignment_scope(shop_id);
 if after_fingerprint is distinct from (select fingerprint from live_assignment_protected_before) then
  raise exception 'STOP: non-QA repair-order records changed; migration rolled back';
 end if;
 if exists(select 1 from public.shop_repair_orders r where public.live_qa_assignment_scope(shop_id)
 and ((coalesce(trim(technician),'') not in ('','Unassigned') and technician_user_id is null)
 or (coalesce(trim(additional_technician),'') not in ('','Unassigned') and additional_technician_user_id is null))) then
  raise exception 'STOP: unresolved QA assignments; migration rolled back';
 end if;
end $$;
commit;
select 'QA assignment enforcement installed; non-QA RO records unchanged' as result;
