-- TEST ONLY: run AFTER shop-test-floor-role-access.sql in guvzuufdmnvurshknsnq.
-- Run this ENTIRE file. No temp tables/functions or cross-statement session state.
-- All fixtures/role changes live inside one subtransaction and roll back even on success.
do $floor_checks$
declare
 qa_shop uuid:='ddd8d44c-041f-4510-aa8b-a03b2dde87a6';
 other_shop uuid:='1161bc88-9ed5-4d76-a2cf-c7a77d41eea9';
 owner_user uuid; tech_user uuid; writer_user uuid; other_owner uuid;
 primary_ro uuid:=gen_random_uuid(); unassigned_ro uuid:=gen_random_uuid();
 additional_ro uuid:=gen_random_uuid(); foreign_ro uuid:=gen_random_uuid();
 assigned_photo text; denied boolean; affected integer; finished boolean:=false;
 writer_role_before text; writer_overrides_before jsonb; tech_active_before boolean;
begin
 if not exists(select 1 from public.shops where id=qa_shop)
 or not exists(select 1 from public.shops where id=other_shop)
 or exists(select 1 from public.shops where id not in (qa_shop,other_shop)) then
  raise exception 'STOP: expected only the verified Shop Test A/B IDs';
 end if;
 select id into owner_user from auth.users where lower(email)='tr.qa.owner@gmail.com';
 select id into tech_user from auth.users where lower(email)='tr.qa.tech@proton.me';
 select id into writer_user from auth.users where lower(email)='tr.qa.writer@proton.me';
 select user_id into other_owner from public.shop_members where shop_id=other_shop and role='owner' and is_active limit 1;
 if owner_user is null or tech_user is null or writer_user is null or other_owner is null then
  raise exception 'STOP: expected QA Owner/Tech/Writer and Test B Owner accounts';
 end if;
 if not exists(select 1 from public.shop_members where shop_id=qa_shop and user_id=owner_user and role='owner' and is_active) then
  raise exception 'STOP: expected active QA Owner in Test A';
 end if;
 if exists(select 1 from public.shop_repair_orders where customer_name='ROLLBACK ROLE TEST') then
  raise exception 'STOP: Existing rollback-test fixtures need review before retry';
 end if;
 select role,permission_overrides into writer_role_before,writer_overrides_before
 from public.shop_members where shop_id=qa_shop and user_id=writer_user and is_active for update;
 select is_active into tech_active_before from public.shop_members
 where shop_id=qa_shop and user_id=tech_user and role='technician' for update;
 if writer_role_before<>'service_writer' or writer_role_before is null or tech_active_before is distinct from true then
  raise exception 'STOP: expected active Writer and Technician presets for this check';
 end if;
 assigned_photo:=qa_shop::text||'/'||primary_ro::text||'/rollback.jpg';

 begin
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  insert into public.shop_repair_orders(id,shop_id,technician,additional_technician,customer_name,created_by) values
   (primary_ro,qa_shop,'tr.qa.tech@proton.me','','ROLLBACK ROLE TEST',owner_user),
   (unassigned_ro,qa_shop,'Unassigned','','ROLLBACK ROLE TEST',owner_user),
   (additional_ro,qa_shop,'Unassigned','tr.qa.tech@proton.me','ROLLBACK ROLE TEST',owner_user);
  perform set_config('request.jwt.claim.sub',other_owner::text,true);
  insert into public.shop_repair_orders(id,shop_id,customer_name,created_by)
   values(foreign_ro,other_shop,'ROLLBACK ROLE TEST',other_owner);

  perform set_config('request.jwt.claim.sub',tech_user::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.shop_repair_orders where id in (primary_ro,unassigned_ro,additional_ro,foreign_ro))<>2 then
   raise exception 'FAIL: Tech reads primary + additional only';
  end if;
  perform public.update_shop_repair_order_work(primary_ro,'In Progress','rollback note',1,'rollback work');
  denied:=false;
  begin perform public.update_shop_repair_order_work(unassigned_ro,'Complete','forged',9,'forged');
  exception when others then
   if sqlerrm<>'Repair order is unavailable.' then raise; end if; denied:=true;
  end;
  if not denied then raise exception 'FAIL: Unassigned work RPC must reject'; end if;
  denied:=false;
  begin perform public.update_shop_repair_order_floor(primary_ro,'tr.qa.tech@proton.me','','High','Complete','forged',9,'forged');
  exception when others then
   if sqlerrm<>'Floor access required' then raise; end if; denied:=true;
  end;
  if not denied then raise exception 'FAIL: Tech cannot use assignment RPC'; end if;
  denied:=false;
  begin perform public.attach_shop_inspection(unassigned_ro::text);
  exception when others then
   if sqlerrm<>'Assigned inspection access required' then raise; end if; denied:=true;
  end;
  if not denied then raise exception 'FAIL: Unassigned inspection must reject'; end if;
  if public.shop_can_access_ro_file(qa_shop::text||'/'||unassigned_ro::text||'/test.jpg','read')
  or not public.shop_can_access_ro_file(qa_shop::text||'/'||primary_ro::text||'/test.jpg','inspection')
  or public.shop_can_access_ro_file(other_shop::text||'/'||foreign_ro::text||'/test.jpg','read')
  or public.shop_can_access_ro_file('invalid/path/test.jpg','read') then
   raise exception 'FAIL: Assigned/unassigned/cross-shop/malformed photo paths';
  end if;
  perform public.attach_shop_inspection(primary_ro::text);
  insert into storage.objects(bucket_id,name,owner_id) values('shop-inspection-media',assigned_photo,tech_user::text);
  denied:=false;
  begin
   insert into storage.objects(bucket_id,name,owner_id)
    values('shop-inspection-media',qa_shop::text||'/'||unassigned_ro::text||'/rollback.jpg',tech_user::text);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: Storage upload to unassigned RO must reject'; end if;
  if not exists(select 1 from storage.objects where name=assigned_photo) then raise exception 'FAIL: Assigned photo readable'; end if;
  denied:=false;
  begin
   update public.shop_inspections set repair_order_id=additional_ro::text where repair_order_id=primary_ro::text;
  exception when others then
   if sqlerrm<>'Service record scope is immutable' then raise; end if; denied:=true;
  end;
  if not denied then raise exception 'FAIL: Inspection scope cannot move between assigned ROs'; end if;
  update public.shop_repair_orders set technician='Unassigned',estimate_total=123 where id=primary_ro;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: Tech direct assignment/estimate update blocked'; end if;
  raise notice 'PASS: Tech visibility, work/assignment RPCs, inspection scope, photo paths and actual Storage RLS';

  execute 'reset role';
  update public.shop_members set role='foreman',permission_overrides='{}' where shop_id=qa_shop and user_id=writer_user;
  perform set_config('request.jwt.claim.sub',writer_user::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.shop_repair_orders where id in (primary_ro,unassigned_ro,additional_ro,foreign_ro))<>3 then
   raise exception 'FAIL: Foreman reads all own-shop test ROs';
  end if;
  if public.shop_has_permission(qa_shop,'invoices.read') or public.shop_has_permission(qa_shop,'expenses.read')
  or public.shop_has_permission(qa_shop,'settings.manage') or public.shop_has_permission(qa_shop,'users.manage') then
   raise exception 'FAIL: Foreman has no default office/admin permissions';
  end if;
  perform public.update_shop_repair_order_floor(unassigned_ro,'tr.qa.tech@proton.me','','High','In Progress','floor note',2,'floor work');
  execute 'reset role';
  if not exists(select 1 from public.shop_repair_orders where id=unassigned_ro and technician_user_id=tech_user and estimate_total=0) then
   raise exception 'FAIL: Floor assignment resolved; estimate unchanged';
  end if;
  raise notice 'PASS: Foreman shop scope, delegation, narrow saves and default permissions';

  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  update public.shop_repair_orders set technician='Unassigned',additional_technician='' where id=primary_ro;
  perform set_config('request.jwt.claim.sub',tech_user::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.shop_repair_orders where id=primary_ro)
  or exists(select 1 from public.shop_inspections where repair_order_id=primary_ro::text)
  or exists(select 1 from storage.objects where name=assigned_photo) then
   raise exception 'FAIL: Assignment removal revokes RO, inspection and photo reads';
  end if;
  execute 'reset role';
  update public.shop_members set is_active=false where shop_id=qa_shop and user_id=tech_user;
  execute 'set local role authenticated';
  if exists(select 1 from public.shop_repair_orders where shop_id=qa_shop) then raise exception 'FAIL: Inactive Tech sees no ROs'; end if;
  execute 'reset role';
  raise notice 'PASS: Reassignment and inactive membership revoke access';
  finished:=true;
  -- Intentional exception rolls back ALL writes and local role/JWT changes in this block.
  raise exception using errcode='ZL001',message='Long Shift successful test rollback';
 exception when sqlstate 'ZL001' then
  if not finished then raise; end if;
 end;
 if not finished then raise exception 'FAIL: Checks did not finish'; end if;
 if exists(select 1 from public.shop_repair_orders where id in (primary_ro,unassigned_ro,additional_ro,foreign_ro))
 or exists(select 1 from public.shop_inspections where repair_order_id=primary_ro::text)
 or exists(select 1 from storage.objects where name=assigned_photo) then raise exception 'FAIL: Rollback retained fixtures'; end if;
 if not exists(select 1 from public.shop_members where shop_id=qa_shop and user_id=writer_user and role=writer_role_before and permission_overrides=writer_overrides_before)
 or not exists(select 1 from public.shop_members where shop_id=qa_shop and user_id=tech_user and is_active=tech_active_before) then
  raise exception 'FAIL: Rollback did not restore original membership';
 end if;
 raise notice 'Rollback complete: no fixtures or role changes retained';
end $floor_checks$;
select 'Rollback complete: no fixtures or role changes retained' as result;
