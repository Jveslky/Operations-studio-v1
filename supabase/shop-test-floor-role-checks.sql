-- TEST ONLY: run AFTER shop-test-floor-role-access.sql in guvzuufdmnvurshknsnq.
-- Rollback-only adversarial database checks. No Auth accounts created; role changes and fixtures roll back.
begin;
create temporary table floor_test_context as
select a.id shop_a,b.id shop_b,
 (select id from auth.users where lower(email)='tr.qa.owner@gmail.com') owner_id,
 (select id from auth.users where lower(email)='tr.qa.tech@proton.me') tech_id,
 (select id from auth.users where lower(email)='tr.qa.writer@proton.me') writer_id,
 gen_random_uuid() assigned_id,gen_random_uuid() unassigned_id,gen_random_uuid() additional_id,
 gen_random_uuid() foreign_id,gen_random_uuid() inspection_id
from public.shops a cross join public.shops b
where a.name='Long Shift Shop Test A' and b.name='Long Shift Shop Test B';
do $$ begin
 if (select count(*) from floor_test_context)<>1 or exists(select 1 from floor_test_context where owner_id is null or tech_id is null or writer_id is null)
 or exists(select 1 from public.shops where name not in ('Long Shift Shop Test A','Long Shift Shop Test B')) then raise exception 'STOP: expected Test A/B and three QA accounts'; end if;
end $$;
grant select on floor_test_context to authenticated;
create function pg_temp.floor_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
select set_config('request.jwt.claim.sub',owner_id::text,true) from floor_test_context;
insert into public.shop_repair_orders(id,shop_id,technician,additional_technician,customer_name,created_by)
select assigned_id,shop_a,'tr.qa.tech@proton.me','','ROLLBACK ROLE TEST',owner_id from floor_test_context
union all select unassigned_id,shop_a,'Unassigned','','ROLLBACK ROLE TEST',owner_id from floor_test_context
union all select additional_id,shop_a,'Unassigned','tr.qa.tech@proton.me','ROLLBACK ROLE TEST',owner_id from floor_test_context;
-- Cross-shop fixture has no assignment. Table privileges here are SQL Editor's, not authenticated's.
select set_config('request.jwt.claim.sub',m.user_id::text,true) from public.shop_members m join floor_test_context t on m.shop_id=t.shop_b where m.role='owner' limit 1;
insert into public.shop_repair_orders(id,shop_id,customer_name,created_by)
select foreign_id,shop_b,'ROLLBACK ROLE TEST',auth.uid() from floor_test_context;
select set_config('request.jwt.claim.sub',tech_id::text,true) from floor_test_context;
set local role authenticated;
select pg_temp.floor_assert((select count(*)=2 from public.shop_repair_orders where id in (select assigned_id from floor_test_context union select unassigned_id from floor_test_context union select additional_id from floor_test_context union select foreign_id from floor_test_context)),'Tech reads primary + additional only');
select public.update_shop_repair_order_work(assigned_id,'In Progress','rollback note',1,'rollback work') from floor_test_context;
do $$ declare r floor_test_context%rowtype; denied boolean:=false; begin
 select * into r from floor_test_context;
 begin perform public.update_shop_repair_order_work(r.unassigned_id,'Complete','forged',9,'forged'); exception when others then denied:=true; end;
 perform pg_temp.floor_assert(denied,'Unassigned work RPC rejected');
 denied:=false;
 begin perform public.update_shop_repair_order_floor(r.assigned_id,'tr.qa.tech@proton.me','','High','Complete','forged',9,'forged'); exception when others then denied:=true; end;
 perform pg_temp.floor_assert(denied,'Tech cannot use assignment RPC');
 denied:=false;
 begin perform public.attach_shop_inspection((select ro_number::text from public.shop_repair_orders where id=r.unassigned_id)); exception when others then denied:=true; end;
 -- Hidden row produces null; separately test known forbidden UUID without relying on SELECT visibility.
 begin perform public.attach_shop_inspection(r.unassigned_id::text); raise exception 'unexpected access'; exception when others then if sqlerrm='unexpected access' then raise; end if; end;
 perform pg_temp.floor_assert(not public.shop_can_access_ro_file(r.shop_a::text||'/'||r.unassigned_id::text||'/test.jpg','read'),'Unassigned photo path rejected');
 perform pg_temp.floor_assert(public.shop_can_access_ro_file(r.shop_a::text||'/'||r.assigned_id::text||'/test.jpg','inspection'),'Assigned photo path allowed');
 perform pg_temp.floor_assert(not public.shop_can_access_ro_file(r.shop_b::text||'/'||r.foreign_id::text||'/test.jpg','read'),'Cross-shop photo path rejected');
 perform pg_temp.floor_assert(not public.shop_can_access_ro_file('invalid/path/test.jpg','read'),'Malformed path fails closed');
end $$;
select public.attach_shop_inspection(assigned_id::text) from floor_test_context;
-- Exercise actual storage RLS, not just the path helper. Metadata is rollback-only; no bytes uploaded.
insert into storage.objects(bucket_id,name,owner_id)
select 'shop-inspection-media',shop_a::text||'/'||assigned_id::text||'/rollback.jpg',tech_id::text from floor_test_context;
do $$ declare r floor_test_context%rowtype; denied boolean:=false; begin
 select * into r from floor_test_context;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('shop-inspection-media',r.shop_a::text||'/'||r.unassigned_id::text||'/rollback.jpg',r.tech_id::text);
 exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.floor_assert(denied,'Storage upload to unassigned RO denied');
 perform pg_temp.floor_assert(exists(select 1 from storage.objects where name=r.shop_a::text||'/'||r.assigned_id::text||'/rollback.jpg'),'Assigned storage object readable');
end $$;
do $$ declare denied boolean:=false; begin
 begin
  update public.shop_inspections set repair_order_id=(select additional_id::text from floor_test_context)
  where repair_order_id in (select assigned_id::text from floor_test_context);
 exception when others then
  if sqlerrm<>'Service record scope is immutable' then raise; end if;
  denied:=true;
 end;
 perform pg_temp.floor_assert(denied,'Inspection cannot move between even two assigned ROs');
end $$;
-- Actual RLS direct-update attempt must affect zero rows, not merely be hidden by UI.
do $$ declare affected integer; begin
 update public.shop_repair_orders set technician='Unassigned',estimate_total=123 where id in (select assigned_id from floor_test_context);
 get diagnostics affected=row_count;
 perform pg_temp.floor_assert(affected=0,'Tech direct assignment/estimate update blocked');
end $$;
reset role;
-- Temporarily use Writer as Foreman to avoid creating a permanent extra account.
update public.shop_members set role='foreman',permission_overrides='{}' where (shop_id,user_id) in (select shop_a,writer_id from floor_test_context);
select set_config('request.jwt.claim.sub',writer_id::text,true) from floor_test_context;
set local role authenticated;
select pg_temp.floor_assert((select count(*)=3 from public.shop_repair_orders where id in (select assigned_id from floor_test_context union select unassigned_id from floor_test_context union select additional_id from floor_test_context union select foreign_id from floor_test_context)),'Foreman reads all own-shop test ROs');
select pg_temp.floor_assert(not public.shop_has_permission(shop_a,'invoices.read') and not public.shop_has_permission(shop_a,'expenses.read') and not public.shop_has_permission(shop_a,'settings.manage') and not public.shop_has_permission(shop_a,'users.manage'),'Foreman has no default office/admin permissions') from floor_test_context;
select public.update_shop_repair_order_floor(unassigned_id,'tr.qa.tech@proton.me','','High','In Progress','floor note',2,'floor work') from floor_test_context;
reset role;
select pg_temp.floor_assert((select technician_user_id=t.tech_id and estimate_total=0 from public.shop_repair_orders r join floor_test_context t on r.id=t.unassigned_id),'Floor assignment resolved; estimate unchanged');
-- Removal revokes tech access on the next database request.
select set_config('request.jwt.claim.sub',owner_id::text,true) from floor_test_context;
update public.shop_repair_orders set technician='Unassigned',additional_technician='' where id in (select assigned_id from floor_test_context);
select set_config('request.jwt.claim.sub',tech_id::text,true) from floor_test_context;
set local role authenticated;
select pg_temp.floor_assert(not exists(select 1 from public.shop_repair_orders where id in (select assigned_id from floor_test_context)),'Removed assignment no longer readable');
select pg_temp.floor_assert(not exists(select 1 from public.shop_inspections where repair_order_id in (select assigned_id::text from floor_test_context)),'Removed assignment hides existing inspections');
select pg_temp.floor_assert(not exists(select 1 from storage.objects where name in (select shop_a::text||'/'||assigned_id::text||'/rollback.jpg' from floor_test_context)),'Removed assignment hides existing photo objects');
reset role;
update public.shop_members set is_active=false where (shop_id,user_id) in (select shop_a,tech_id from floor_test_context);
set local role authenticated;
select pg_temp.floor_assert(not exists(select 1 from public.shop_repair_orders where shop_id in (select shop_a from floor_test_context)),'Inactive tech sees no ROs');
reset role;
rollback;
select 'Rollback complete: no fixtures or role changes retained' as result;
