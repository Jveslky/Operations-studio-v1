import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', writer='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222', tech='33333333-3333-3333-3333-333333333333';
await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text); create table public.shops(id uuid primary key);
create table public.test_members(shop_id uuid,user_id uuid,role text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function public.has_shop_role(s uuid, r text[]) returns boolean language sql stable security definer as $$select exists(select 1 from public.test_members where shop_id=s and user_id=auth.uid() and role=any(r))$$;
create function public.is_shop_member(s uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.test_members where shop_id=s and user_id=auth.uid())$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text); alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;
insert into shops values('${A}'),('${B}'); insert into auth.users values('${writer}','writer@example.test'),('${other}','owner-b@example.test'),('${tech}','tech@example.test');
insert into test_members values('${A}','${writer}','service_writer'),('${B}','${other}','owner'),('${A}','${tech}','technician');`);
await db.exec(fs.readFileSync(new URL('../supabase/shop-repair-orders.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/shop-estimate-approvals.sql',import.meta.url),'utf8'));

await db.exec(fs.readFileSync(new URL('../supabase/shop-invoices.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/shop-supplemental-estimates-20261011.sql',import.meta.url),'utf8'));
await db.exec(`set role authenticated; select set_config('test.user','${writer}',false);`);
const ro=(await db.query(`insert into shop_repair_orders(shop_id,complaint,estimate_labor_hours,estimate_labor_rate,estimate_parts_total,estimate_total,status) values('${A}','Original work',2,150,150,450,'Ready for Payment') returning *`)).rows[0];
const price={description:'Replace tire',labor_hours:1,labor_rate:100,parts_total:150,other_charges:0,discount:0,other_taxable:false,status:'Draft'};
async function save(existing,estimate=price,roId=ro.id){return (await db.query('select * from save_shop_supplement($1,$2,$3,$4)',[roId,existing?.id || null,existing?.updated_at || null,JSON.stringify(estimate)])).rows[0];}
async function approve(s,auth={method:'verbal',customer_contact:'Jon',notes:'Approved by phone'}){return (await db.query('select * from approve_shop_supplement($1,$2,$3,$4)',[s.id,s.updated_at,s.revision,JSON.stringify(auth)])).rows[0];}
let supplement=await save(null,{...price,total:1,revision:99,status:'Sent'});
assert.equal(supplement.revision,1);assert.equal(Number(supplement.total),250);assert.equal(supplement.status,'Sent');
await assert.rejects(save(null,{...price,status:'Approved'}),/Record customer authorization/);
await assert.rejects(save(null,{...price,parts_total:-1}),/nonnegative/);
await assert.rejects(save(null,{...price,labor_hours:'1.001'}),/nonnegative/);
await assert.rejects(approve(supplement,{method:'verbal',customer_contact:'Jon',notes:''}),/verbal/);
await assert.rejects(approve(supplement,{method:'written',customer_contact:'Jon',evidence_path:`${B}/${ro.id}/bad.pdf`}),/evidence/);
const beforeApproval=supplement;supplement=await approve(supplement);
assert.equal(supplement.status,'Approved');assert.equal((await db.query('select status from shop_repair_orders where id=$1',[ro.id])).rows[0].status,'Ready for Payment');
let records=(await db.query('select * from shop_supplement_authorizations')).rows;
assert.equal(records.length,1);assert.equal(records[0].recorded_by,writer);assert.equal(records[0].recorded_by_email,'writer@example.test');assert.equal(Number(records[0].authorized_amount),250);assert.equal(records[0].estimate_snapshot.description,'Replace tire');
await assert.rejects(approve(beforeApproval),/changed/);await assert.rejects(approve(supplement),/already approved/);
await assert.rejects(db.query('update shop_supplement_authorizations set notes=$1',['Forged']),/permission denied/);
await assert.rejects(db.query('delete from shop_supplement_authorizations'),/permission denied/);
const approvedRevision=supplement;supplement=await save(supplement,{...price,parts_total:200});
assert.equal(supplement.revision,2);assert.equal(supplement.status,'Draft');assert.equal(Number(supplement.total),300);
assert.equal((await db.query('select estimate_version from shop_repair_orders where id=$1',[ro.id])).rows[0].estimate_version,1);
await assert.rejects(save(approvedRevision),/changed/);
const evidencePath=`${A}/${ro.id}/supplement-signed.pdf`;
await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['shop-approval-evidence',evidencePath,writer]);
supplement=await approve(supplement,{method:'written',customer_contact:'Jon',notes:'New price approved',evidence_path:evidencePath,evidence_name:'signed.pdf'});
assert.equal((await db.query('select * from storage.objects')).rows.length,1);
records=(await db.query('select * from shop_supplement_authorizations order by revision')).rows;assert.equal(records.length,2);assert.equal(Number(records[0].authorized_amount),250);assert.equal(Number(records[1].authorized_amount),300);
const pending=await save(null,{...price,description:'Pending work',parts_total:0});assert.equal(pending.supplement_number,2);
async function invoice(subtotal,items){return db.query(`insert into shop_invoices(shop_id,repair_order_id,subtotal,total,fee_snapshot) values($1,$2,$3,$3,$4) returning *`,[A,ro.id,subtotal,JSON.stringify({supplements:items})]);}
await assert.rejects(invoice(450,[]),/supplements changed/);
await assert.rejects(invoice(750,[approvedRevision]),/supplements changed/);
await assert.rejects(invoice(1050,[supplement,supplement]),/supplements changed/);
await assert.rejects(invoice(450,[supplement]),/subtotal/);
const created=(await invoice(750,[{...supplement,total:1,description:'Forged'}])).rows[0];
assert.equal(Number(created.subtotal),750);assert.equal(created.fee_snapshot.supplements.length,1);assert.equal(Number(created.fee_snapshot.supplements[0].total),300);assert.equal(created.fee_snapshot.supplements[0].description,'Replace tire');
await assert.rejects(invoice(750,[supplement]),/unique/);
await assert.rejects(save(supplement),/already invoiced/);await assert.rejects(save(null),/already invoiced/);await assert.rejects(approve(pending),/invoiced/);
for(const user of [other,tech]){
 await db.query("select set_config('test.user',$1,false)",[user]);
 assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('select * from shop_supplemental_estimates')).rows.length,0);assert.equal((await db.query('select * from shop_supplement_authorizations')).rows.length,0);
 await assert.rejects(save(null),/role cannot/);await assert.rejects(approve(supplement),/role cannot/);
}
console.log('Supplement PostgreSQL: scoped permissions, independent revisions, immutable approval history, authoritative prices, stale requests, exact-once invoice snapshots and invoiced locks passed.');
await db.close();
