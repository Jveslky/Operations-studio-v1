// npm install --no-save @electric-sql/pglite@0.5.8, then node tests/live-qa-assignment-access.mjs
// No network or Supabase connection; disposable in-memory PostgreSQL with Auth/Storage stubs.
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'');process.exit(1);});
const db=new PGlite();
await db.exec(`create role anon; create role authenticated;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'email',(select email from auth.users where id=auth.uid()))$$;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
grant usage on schema public,auth,storage to authenticated,anon;
grant select on auth.users to authenticated;
grant all on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
`);
const base=new URL('../supabase/',import.meta.url);
const read=(file)=>fs.readFileSync(new URL(file,base),'utf8').replace(/create extension if not exists pgcrypto;/gi,'');
await db.exec(read('auth-and-membership.sql'));
await db.exec(`create table public."Customers" (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 name text, phone text, email text, address text, notes text,
 shop_id uuid not null,
 contact_name text,
 archived boolean not null default false,
 updated_at timestamptz
);
create table public.customer_units (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 customer_id uuid not null references public."Customers"(id) on delete cascade,
 name text,
 archived boolean not null default false,
 year text, make text, model text, serial text,
 engine_make text, engine_model text, fuel_type text, displacement text,
 updated_at timestamptz
);


`);
const sources=['shop-customer-unit-security.sql','shop-repair-orders.sql','shop-invoices.sql','shop-appointments.sql','shop-appointments-overnight.sql','ap-invoice-scanning.sql','team-documents.sql','shop-requests.sql','inspection-media-foundation.sql','inspection-templates-and-rules.sql','custom-inspection-response-sets.sql','inspection-completion-notifications.sql','shop-user-permissions.sql','shop-technician-workspace-access.sql','shop-profile-settings.sql','customer-tax-settings.sql','shop-behavior-settings.sql','shop-appearance-settings.sql','shop-backup-appointments.sql','shop-customer-unit-legacy-policy-cleanup.sql'];
for(const file of sources) {
 try {await db.exec(read(file));}catch(e){console.error('FAIL baseline',file,e.message);process.exit(1);}
}
await db.exec(`insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000000001','tr.qa.owner@gmail.com'),
('00000000-0000-0000-0000-000000000002','tr.qa.tech@proton.me'),
('00000000-0000-0000-0000-000000000003','tr.qa.writer@proton.me'),
('00000000-0000-0000-0000-000000000004','tr.qa.owner+shopb@gmail.com');
insert into public.shops(id,name,created_by) values('b40cf910-b4df-4558-bb46-1eb18a4f4cb8','TRQ&A','00000000-0000-0000-0000-000000000001'),('322f19e9-f0ce-492e-ada7-9f3298c16376','2TRQ&A','00000000-0000-0000-0000-000000000004');
insert into public.shop_members(shop_id,user_id,role) values
('b40cf910-b4df-4558-bb46-1eb18a4f4cb8','00000000-0000-0000-0000-000000000001','owner'),
('b40cf910-b4df-4558-bb46-1eb18a4f4cb8','00000000-0000-0000-0000-000000000002','technician'),
('b40cf910-b4df-4558-bb46-1eb18a4f4cb8','00000000-0000-0000-0000-000000000003','service_writer'),
('322f19e9-f0ce-492e-ada7-9f3298c16376','00000000-0000-0000-0000-000000000004','owner');`);

const qa='b40cf910-b4df-4558-bb46-1eb18a4f4cb8', other='322f19e9-f0ce-492e-ada7-9f3298c16376', protectedShop='9802551d-b342-40d6-ab1b-d67f11746cd5';
const owner='00000000-0000-0000-0000-000000000001', tech='00000000-0000-0000-0000-000000000002', writer='00000000-0000-0000-0000-000000000003', otherOwner='00000000-0000-0000-0000-000000000004', protectedOwner='00000000-0000-0000-0000-000000000005', protectedTech='00000000-0000-0000-0000-000000000006';
await db.exec(`insert into auth.users(id,email) values('${protectedOwner}','protected.owner@example.invalid'),('${protectedTech}','protected.tech@example.invalid');
insert into shops(id,name,created_by) values('${protectedShop}','Del-Mobile Machine Service','${protectedOwner}');
insert into shop_members(shop_id,user_id,role) values('${protectedShop}','${protectedOwner}','owner'),('${protectedShop}','${protectedTech}','technician');`);
const insertRO=async(shop,label='Unassigned',additional='')=>(await db.query('insert into shop_repair_orders(shop_id,technician,additional_technician,customer_name,created_by) values($1,$2,$3,$4,$5) returning *',[shop,label,additional,'Disposable local fixture',shop===protectedShop?protectedOwner:shop===other?otherOwner:owner])).rows[0];
const assigned=await insertRO(qa,'tr.qa.tech@proton.me'), unassigned=await insertRO(qa), additional=await insertRO(qa,'Unassigned','tr.qa.tech@proton.me'), foreign=await insertRO(other), unaffected=await insertRO(protectedShop,'protected.tech@example.invalid');
const protectedBefore=(await db.query('select to_jsonb(r) - \'technician_user_id\' - \'additional_technician_user_id\' as row from shop_repair_orders r where shop_id=$1',[protectedShop])).rows;
const legacyPolicies=(await db.query("select policyname,qual,with_check from pg_policies where schemaname='storage' order by policyname")).rows;
const rolePresets=(await db.query("select shop_role_permissions('service_writer') writer, shop_role_permissions('technician') tech")).rows;
const migration=read('live-qa-assignment-access.sql');
await db.exec(migration);
const after=(await db.query('select to_jsonb(r) - \'technician_user_id\' - \'additional_technician_user_id\' as row from shop_repair_orders r where shop_id=$1',[protectedShop])).rows;
assert.deepEqual(after,protectedBefore,'protected business record unchanged, including updated_at');
assert.equal((await db.query('select technician_user_id from shop_repair_orders where id=$1',[unaffected.id])).rows[0].technician_user_id,null,'protected assignment not backfilled');
assert.deepEqual((await db.query("select shop_role_permissions('service_writer') writer, shop_role_permissions('technician') tech")).rows,rolePresets);
for(const p of legacyPolicies) assert.deepEqual((await db.query("select policyname,qual,with_check from pg_policies where schemaname='storage' and policyname=$1",[p.policyname])).rows[0],p,'legacy bucket policies unchanged');
await db.exec(migration);
assert.deepEqual((await db.query('select to_jsonb(r) - \'technician_user_id\' - \'additional_technician_user_id\' as row from shop_repair_orders r where shop_id=$1',[protectedShop])).rows,protectedBefore);
await assert.rejects(db.exec(migration.replace('do $$ declare after_fingerprint',
 ()=>`update shop_repair_orders set complaint='intentional protected-record test' where shop_id='${protectedShop}';
do $$ declare after_fingerprint`)),/non-QA repair-order records changed/);
await db.exec('rollback');
assert.deepEqual((await db.query("select to_jsonb(r) - 'technician_user_id' - 'additional_technician_user_id' as row from shop_repair_orders r where shop_id=$1",[protectedShop])).rows,protectedBefore);
console.log('PASS: protected-record fingerprint detects mutation and rolls back');
console.log('PASS: QA-only backfill, protected record/timestamps and roles unchanged, bucket policies retained, migration rerun');
await db.exec('begin');
const actor=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec('set local role authenticated');};
const denied=async(sql,args)=>{await db.exec('savepoint denial');await assert.rejects(db.query(sql,args));await db.exec('rollback to savepoint denial');};
await actor(owner);
const inspection=(await db.query('select attach_shop_inspection($1) id',[assigned.id])).rows[0].id;
await db.exec('reset role');
const item=(await db.query("insert into shop_inspection_items(shop_id,inspection_id,section_title,item_label) values($1,$2,'Test','Check') returning id",[qa,inspection])).rows[0].id;
await actor(owner);
const path=`${qa}/${assigned.id}/fixture.jpg`;
const media=(await db.query("insert into shop_ro_media(shop_id,repair_order_id,inspection_id,object_path,mime_type,file_size,uploaded_by) values($1,$2,$3,$4,'image/jpeg',10,$5) returning id",[qa,assigned.id,inspection,path,owner])).rows[0].id;
await db.query("insert into storage.objects(bucket_id,name,owner_id) values('shop-inspection-media',$1,$2)",[path,owner]);
await actor(tech);
assert.deepEqual((await db.query('select id from shop_repair_orders order by id')).rows.map(r=>r.id).sort(),[assigned.id,additional.id].sort());
assert.equal((await db.query('select id from shop_inspections where id=$1',[inspection])).rows.length,1);
assert.equal((await db.query('select id from shop_inspection_items where id=$1',[item])).rows.length,1);
assert.equal((await db.query('select id from shop_ro_media where id=$1',[media])).rows.length,1);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,1);
await db.query("select update_shop_repair_order_work($1,'In Progress','saved',1,'work')",[assigned.id]);
await db.query("select update_shop_repair_order_work($1,'In Progress','additional',1,'work')",[additional.id]);
await denied("select update_shop_repair_order_work($1,'Complete','forged',9,'forged')",[unassigned.id]);
await denied('select attach_shop_inspection($1)',[unassigned.id]);
await denied('insert into shop_repair_orders(shop_id) values($1)',[qa]);
assert.equal((await db.query("update shop_repair_orders set technician='tr.qa.tech@proton.me' where id=$1 returning id",[assigned.id])).rows.length,0);
await actor(writer);
for(const label of ['Unassigned','tr.qa.tech@proton.me']) assert.equal((await db.query('insert into shop_repair_orders(shop_id,technician,created_by) values($1,$2,$3) returning id',[qa,label,writer])).rows.length,1);
await db.query("update shop_repair_orders set technician='Unassigned' where id=$1",[assigned.id]);
await actor(tech);
for(const [table,id] of [['shop_repair_orders',assigned.id],['shop_inspections',inspection],['shop_inspection_items',item],['shop_ro_media',media]]) assert.equal((await db.query(`select id from ${table} where id=$1`,[id])).rows.length,0,`${table} revoked`);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,0);
await denied("select update_shop_repair_order_work($1,'Complete','forged',9,'forged')",[assigned.id]);
await denied('select attach_shop_inspection($1)',[assigned.id]);
await denied("insert into storage.objects(bucket_id,name,owner_id) values('shop-inspection-media',$1,$2)",[`${qa}/${assigned.id}/forged.jpg`,tech]);
await actor(owner);
assert.equal((await db.query('select id from shop_ro_media where id=$1',[media])).rows.length,1);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,1);
await db.query('update shop_repair_orders set additional_technician=$1 where id=$2',['tr.qa.tech@proton.me',assigned.id]);
await actor(tech);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,1);
await db.exec('reset role');await db.query('update shop_members set is_active=false where shop_id=$1 and user_id=$2',[qa,tech]);await db.exec('set local role authenticated');
assert.equal((await db.query('select id from shop_repair_orders where id=$1',[assigned.id])).rows.length,0);
await denied("select update_shop_repair_order_work($1,'Complete','forged',9,'forged')",[assigned.id]);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,0);
await actor(otherOwner);
assert.equal((await db.query('select id from shop_repair_orders where id=$1',[assigned.id])).rows.length,0);
assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,0);
await denied('select attach_shop_inspection($1)',[assigned.id]);
await denied("select update_shop_repair_order_work($1,'Complete','forged',9,'forged')",[assigned.id]);
await actor(protectedTech);
assert.equal((await db.query('select id from shop_repair_orders where id=$1',[unaffected.id])).rows.length,1);
await db.query("select update_shop_repair_order_work($1,'In Progress','legacy work',1,'work')",[unaffected.id]);
await db.query('select attach_shop_inspection($1)',[unaffected.id]);
await db.exec('rollback');
console.log('PASS: primary/additional Tech access; work saves; assignment removal revokes RO/inspection/items/media/storage/work; inactive and cross-shop denial; owner photo access; Writer INSERT RETURNING; protected legacy Tech workflow');
await db.close();

const dashboard=fs.readFileSync(new URL('../pages/Shop/technician-dashboard.js',import.meta.url),'utf8');
const assignmentFunction=dashboard.slice(dashboard.indexOf('function isAssigned('),dashboard.indexOf('    function renderOrders('));
const check=(ctx,order)=>vm.runInNewContext(assignmentFunction+';isAssigned(order)',{context:ctx,order});
assert.equal(check({shopId:qa,user:{id:tech,email:'changed@example.invalid'}},{technicianUserId:tech}),true);
assert.equal(check({shopId:qa,user:{id:tech,email:'tr.qa.tech@proton.me'}},{technician:'tr.qa.tech@proton.me'}),false);
assert.equal(check({shopId:protectedShop,user:{id:protectedTech,email:'protected.tech@example.invalid'}},{technician:'protected.tech@example.invalid'}),true);
console.log('PASS: QA dashboard uses Auth UUID; non-QA dashboard retains email matching');
