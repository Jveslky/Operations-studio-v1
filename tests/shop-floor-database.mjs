// npm install --no-save @electric-sql/pglite@0.5.8, then node tests/shop-floor-database.mjs
// No network or Supabase connection; disposable in-memory PostgreSQL with Auth/Storage stubs.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
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
insert into public.shops(id,name,created_by) values('ddd8d44c-041f-4510-aa8b-a03b2dde87a6','Long Shift Shop Test A','00000000-0000-0000-0000-000000000001'),('1161bc88-9ed5-4d76-a2cf-c7a77d41eea9','Long Shift Shop Test B','00000000-0000-0000-0000-000000000004');
insert into public.shop_members(shop_id,user_id,role) values
('ddd8d44c-041f-4510-aa8b-a03b2dde87a6','00000000-0000-0000-0000-000000000001','owner'),
('ddd8d44c-041f-4510-aa8b-a03b2dde87a6','00000000-0000-0000-0000-000000000002','technician'),
('ddd8d44c-041f-4510-aa8b-a03b2dde87a6','00000000-0000-0000-0000-000000000003','service_writer'),
('1161bc88-9ed5-4d76-a2cf-c7a77d41eea9','00000000-0000-0000-0000-000000000004','owner');`);

for(const file of ['shop-test-floor-role-access.sql','shop-test-floor-role-checks.sql']){
 try{await db.exec(read(file));console.log('PASS',file);}catch(e){console.log('FAIL',file,e.message,e.where);process.exit(1);}
}
const retained=(await db.query('select count(*)::int as count from public.shop_repair_orders')).rows[0].count;
if(retained!==0) throw new Error('Rollback retained repair-order fixtures');
// Force an unexpected failure after the writes to verify rollback on failure as well as success.
let failureObserved=false;
try {
 await db.exec(read('shop-test-floor-role-checks.sql').replace('  finished:=true;', "  raise exception 'intentional test failure';"));
} catch(error) {
 if(error.message!=='intentional test failure') throw error;
 failureObserved=true;
}
assert.equal(failureObserved,true);
assert.equal((await db.query('select count(*)::int as count from public.shop_repair_orders')).rows[0].count,0);
assert.equal((await db.query("select role from public.shop_members where user_id='00000000-0000-0000-0000-000000000003'")).rows[0].role,'service_writer');
console.log('PASS: unexpected failure also restores fixtures and Writer role');
// Reapply migration to verify idempotence.
await db.exec(read('shop-test-floor-role-access.sql'));
const authSource=fs.readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
const roleLiteral=authSource.slice(authSource.indexOf('const rolePermissions =')+'const rolePermissions ='.length,authSource.indexOf('};',authSource.indexOf('const rolePermissions ='))+1);
const presets=vm.runInNewContext('('+roleLiteral+')');
for(const [role,allowed] of Object.entries(presets)) {
 const actual=(await db.query('select public.shop_role_permissions($1) as permissions',[role])).rows[0].permissions;
 assert.deepEqual(Object.keys(actual).filter(k=>actual[k]).sort(),Array.from(allowed).sort(),`${role} frontend/SQL presets agree`);
}
console.log('PASS: role presets agree between frontend and database');
console.log('PASS: migration rerun; rollback retained zero ROs');
// Regression: same-statement INSERT RETURNING must see the new row.
await db.exec(`drop policy "assigned ro read boundary" on public.shop_repair_orders;
create policy "assigned ro read boundary" on public.shop_repair_orders as restrictive for select to authenticated using(public.shop_can_access_ro(shop_id,id::text,'read'));
begin; set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);`);
await assert.rejects(db.query("insert into public.shop_repair_orders(shop_id) values('ddd8d44c-041f-4510-aa8b-a03b2dde87a6') returning *"),/assigned ro read boundary/);
await db.exec('rollback');
console.log('PASS: original INSERT RETURNING policy failure reproduced');
await db.exec(read('shop-test-ro-insert-read-policy-fix.sql'));
await db.exec(read('shop-test-ro-insert-read-policy-fix.sql'));
const shopA='ddd8d44c-041f-4510-aa8b-a03b2dde87a6';
const shopB='1161bc88-9ed5-4d76-a2cf-c7a77d41eea9';
const tech='00000000-0000-0000-0000-000000000002';
for (const user of ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003']) {
 await db.exec('begin; set local role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 for (const assigned of ['Unassigned','tr.qa.tech@proton.me']) {
  const rows=(await db.query('insert into public.shop_repair_orders(shop_id,customer_name,complaint,technician) values($1,$2,$3,$4) returning *',[shopA,'INSERT RETURNING TEST','needs work',assigned])).rows;
  assert.equal(rows.length,1);
  assert.equal(rows[0].technician_user_id,assigned==='Unassigned'?null:tech);
 }
 await assert.rejects(db.query('insert into public.shop_repair_orders(shop_id,customer_name) values($1,$2) returning *',[shopB,'FORBIDDEN']),/row-level security|Assignment permission required/);
 await db.exec('rollback');
}
await db.exec('begin');
await db.query("select set_config('request.jwt.claim.sub',$1,true)",['00000000-0000-0000-0000-000000000001']);
const assigned=(await db.query('insert into public.shop_repair_orders(shop_id,technician) values($1,$2) returning id',[shopA,'tr.qa.tech@proton.me'])).rows[0].id;
const unassigned=(await db.query('insert into public.shop_repair_orders(shop_id) values($1) returning id',[shopA])).rows[0].id;
await db.query("select set_config('request.jwt.claim.sub',$1,true)",[tech]);
await db.exec('set local role authenticated');
assert.deepEqual((await db.query('select id from public.shop_repair_orders')).rows.map(r=>r.id),[assigned]);
await assert.rejects(db.query('insert into public.shop_repair_orders(shop_id) values($1) returning id',[shopA]),/permission|security/);
await db.exec('rollback');
assert.equal((await db.query('select count(*)::int as count from public.shop_repair_orders')).rows[0].count,0);
console.log('PASS: Owner/Writer INSERT RETURNING assigned and unassigned; other-shop insert denied; Tech assigned-only reads and no creation; fix rerun; zero retained fixtures');
await db.close();
