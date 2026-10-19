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
const scopeRepair=await db.exec(fs.readFileSync(new URL('../supabase/shop-approval-scope-repair-20261011.sql',import.meta.url),'utf8'));
assert.deepEqual(scopeRepair.at(-1).rows[0],{scope_column_installed:true,description_column_installed:true,scope_save_installed:true});
await db.exec(`set role authenticated; select set_config('test.user','${writer}',false);`);
const ro=(await db.query(`insert into shop_repair_orders(shop_id,complaint,estimate_total) values('${A}','Replace brakes',460) returning *`)).rows[0];
let seq=0;
function request(row,extra={}) {return {id:`44444444-4444-4444-4444-${String(++seq).padStart(12,'0')}`,method:'verbal',customer_contact:'Jon',notes:'Customer authorized by phone',expected_version:row.estimate_version,expected_updated_at:row.updated_at,...extra};}
async function approve(row,extra={},status='Approved'){const prior=(await db.query('select id from shop_estimate_approvals where repair_order_id=$1',[row.id])).rows; extra={...(prior.length?{authorization_relationship:'additional',approval_scope:'custom',approval_scope_details:'Additional work',authorized_amount:row.estimate_total}:{authorization_relationship:'initial'}),...extra};return (await db.query('update shop_repair_orders set estimate_approval_status=$1, approval_request=$2 where id=$3 returning *',[status,JSON.stringify(request(row,extra)),row.id])).rows[0];}
await assert.rejects(db.query(`update shop_repair_orders set estimate_approval_status='Approved' where id='${ro.id}'`),/authorization/);
await assert.rejects(approve(ro,{notes:''}),/verbal/);
let current=await approve(ro,{recorded_by:other,recorded_at:'1999-01-01',approved_amount:1});
assert.equal(current.status,'In Progress');assert.equal(current.approval_request,null);
let audits=(await db.query('select * from shop_estimate_approvals')).rows;
assert.equal(audits.length,1);assert.equal(audits[0].recorded_by,writer);assert.equal(audits[0].recorded_by_email,'writer@example.test');assert.ok(audits[0].recorded_at);assert.equal(Number(audits[0].approved_amount),460);assert.equal(audits[0].estimate_snapshot.complaint,'Replace brakes');
await assert.rejects(approve(ro),/changed/);
await assert.rejects(db.query('update shop_estimate_approvals set customer_contact=$1',['Forged']),/permission denied/);
await assert.rejects(db.query('delete from shop_estimate_approvals'),/permission denied/);
current=(await db.query('update shop_repair_orders set estimate_total=600,status=$1 where id=$2 returning *',['Ready for Payment',ro.id])).rows[0];
assert.equal(current.estimate_version,2);assert.equal(current.estimate_approval_status,'Draft');
current=await approve(current,{method:'written'});assert.equal(current.status,'Ready for Payment');
audits=(await db.query('select * from shop_estimate_approvals order by estimate_version')).rows;assert.equal(audits.length,2);assert.equal(Number(audits[0].approved_amount),460);assert.equal(Number(audits[1].approved_amount),600);
await assert.rejects(approve(current,{evidence_path:`${B}/${ro.id}/fake.pdf`}),/evidence/);
const path=`${A}/${ro.id}/signed.pdf`;
await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['shop-approval-evidence',path,writer]);
current=await approve(current,{method:'written',evidence_path:path,evidence_name:'signed.pdf'});assert.equal(current.status,'Ready for Payment');
assert.equal((await db.query('select * from storage.objects')).rows.length,1);
assert.equal((await db.query('delete from storage.objects returning *')).rows.length,0);
assert.equal((await db.query('update storage.objects set name=$1 returning *',['tampered'])).rows.length,0);
for (const stage of ['In Progress','Waiting Parts','Ready for Pickup','Ready for Payment','Awaiting Payment','Complete','Closed','Paid']) {
 current=(await db.query('update shop_repair_orders set status=$1 where id=$2 returning *',[stage,ro.id])).rows[0];
 current=await approve(current,{method:'digital'}); assert.equal(current.status,stage);
}
await assert.rejects(approve(current,{approval_scope:'custom',approval_scope_details:''}),/custom/);
current=await approve(current,{method:'written',approval_scope:'custom',approval_scope_details:'Front brakes only',authorized_amount:220});
const scoped=(await db.query("select * from shop_estimate_approvals where approval_scope_details='Front brakes only'")).rows;
assert.equal(scoped.length,1);assert.equal(scoped[0].approval_scope_details,'Front brakes only');assert.equal(Number(scoped[0].approved_amount),220);
assert.equal(Number(scoped[0].authorization_amount),220);assert.equal(Number(scoped[0].estimate_snapshot.estimate_total),600);
await assert.rejects(approve(current,{approval_scope:'custom',approval_scope_details:'Brakes',authorized_amount:-1}),/authorized amount/);
await assert.rejects(approve(current,{approval_scope:'custom',approval_scope_details:'Brakes',authorized_amount:'1.001'}),/authorized amount/);
await assert.rejects(approve(current,{expected_authorized_version:999}),/revision/);
current=await approve(current,{authorization_relationship:'replacement',related_authorization_id:audits[0].id,approval_scope:'entire',authorized_amount:1});
assert.equal(Number((await db.query('select authorization_amount from shop_estimate_approvals order by recorded_at desc limit 1')).rows[0].authorization_amount),600);
await assert.rejects(approve(current,{authorization_relationship:'additional',approval_scope:'entire'}),/Additional work requires/);
// Relationships are explicit and append-only; invalid replacements cannot create records.
const predecessor=scoped[0].id;
await assert.rejects(approve(current,{authorization_relationship:null}),/Choose how/);
await assert.rejects(approve(current,{authorization_relationship:'initial'}),/Earlier authorizations/);
await assert.rejects(approve(current,{authorization_relationship:'replacement',related_authorization_id:'99999999-9999-9999-9999-999999999999'}),/Select an earlier/);
current=await approve(current,{authorization_relationship:'replacement',related_authorization_id:predecessor});
assert.equal((await db.query('select authorization_relationship from shop_estimate_approvals where id=$1',[predecessor])).rows[0].authorization_relationship,'additional');
await assert.rejects(approve(current,{authorization_relationship:'replacement',related_authorization_id:predecessor}),/already been superseded/);
const replacement=(await db.query("select * from shop_estimate_approvals where authorization_relationship='replacement'")).rows[0];
await assert.rejects(approve(current,{authorization_relationship:'amendment',related_authorization_id:replacement.id}),/Explain the amendment/);
current=await approve(current,{authorization_relationship:'amendment',related_authorization_id:replacement.id,relationship_notes:'Customer changed scope; this is the complete resulting authorization.'});
assert.equal((await db.query("select count(*)::int as n from shop_estimate_approvals where authorization_relationship='amendment'")).rows[0].n,1);
await db.exec(`select set_config('test.user','${other}',false);`);
assert.equal((await db.query('select * from shop_estimate_approvals')).rows.length,0);
assert.equal((await db.query('select * from shop_repair_orders')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['shop-approval-evidence',`${A}/${ro.id}/bad.pdf`,other]),/row-level security/);
await db.exec(`select set_config('test.user','${tech}',false);`);
assert.equal((await db.query('select * from shop_estimate_approvals')).rows.length,0);
await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['shop-approval-evidence',`${A}/${ro.id}/bad.pdf`,tech]),/row-level security/);
await db.exec('reset role');
await assert.rejects(approve(current),/role cannot/);
console.log('PostgreSQL approval audit: atomic history, actor/time, revisions, stale saves, later-stage protection, private evidence, office-only access and cross-shop isolation passed.');
// Install the incremental fix on an existing approval database, twice.
await db.exec(`alter table shops add column default_taxable boolean default true,add column default_tax_rate numeric default 6;
create table customer_tax_profiles(shop_id uuid,customer_id text,tax_status text);`);
const taxMigration=fs.readFileSync(new URL('../supabase/shop-approval-tax-20261019.sql',import.meta.url),'utf8');
await db.exec(taxMigration);await db.exec(taxMigration);
await db.exec(`set role authenticated; select set_config('test.user','${writer}',false);`);
let taxRo=(await db.query(`insert into shop_repair_orders(shop_id,complaint,estimate_parts_total,estimate_total) values('${A}','Filters',30,30) returning *`)).rows[0];
await assert.rejects(approve(taxRo),/tax or total changed/);
taxRo=await approve(taxRo,{expected_estimate_total:31.8});
const firstTax=(await db.query('select * from shop_estimate_approvals where repair_order_id=$1',[taxRo.id])).rows[0];
assert.equal(Number(firstTax.authorization_amount),31.8);assert.equal(firstTax.estimate_snapshot.authorization_tax_snapshot.tax,1.8);
assert.equal(Number(taxRo.estimate_total),30); // Existing RO subtotal contract stays intact.
await db.exec('reset role');await db.exec(`update shops set default_tax_rate=7 where id='${A}'`);
await db.exec('set role authenticated');
await assert.rejects(approve(taxRo,{authorization_relationship:'replacement',related_authorization_id:firstTax.id,approval_scope:'entire',expected_estimate_total:31.8}),/tax or total changed/);
assert.equal((await db.query('select count(*)::int n from shop_estimate_approvals where repair_order_id=$1',[taxRo.id])).rows[0].n,1);
taxRo=await approve(taxRo,{authorization_relationship:'replacement',related_authorization_id:firstTax.id,approval_scope:'entire',expected_estimate_total:32.1});
await db.exec('reset role');await db.exec(`insert into customer_tax_profiles values('${A}','exempt','exempt');`);await db.exec('set role authenticated');
let exempt=(await db.query(`insert into shop_repair_orders(shop_id,customer_id,estimate_parts_total,estimate_total) values('${A}','exempt',30,30) returning *`)).rows[0];
exempt=await approve(exempt,{expected_estimate_total:30});
assert.equal(Number((await db.query('select authorization_amount from shop_estimate_approvals where repair_order_id=$1',[exempt.id])).rows[0].authorization_amount),30);
assert.equal(Number((await db.query('select authorization_amount from shop_estimate_approvals where id=$1',[firstTax.id])).rows[0].authorization_amount),31.8);
console.log('Approval tax SQL: rerunnable migration, authoritative gross amount and tax snapshot, stale tax rejection, exempt customer and immutable history passed.');
await db.exec('reset role');
const {default:vm}=await import('node:vm');const taxContext={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/shop-estimate-tax.js',import.meta.url),'utf8'),taxContext);
for(const values of [
 {estimateLaborHours:1,estimateLaborRate:100,estimatePartsTotal:20,estimateShopSupplies:10,estimateEnvironmentalFee:15,estimateOtherCharges:5,estimateDiscount:20},
 {estimatePartsTotal:30,estimateShopSupplies:10,estimateShopSuppliesTaxable:true,estimateEnvironmentalFee:15,estimateEnvironmentalFeeTaxable:true,estimateOtherCharges:5,estimateMiscFeeTaxable:false},
 {estimatePartsTotal:.3}, {estimatePartsTotal:15,estimateDiscount:50}
]) {
 const model={estimateShopSuppliesTaxable:false,estimateEnvironmentalFeeTaxable:false,estimateMiscFeeTaxable:false,...values};
 const snake=Object.fromEntries(Object.entries(model).map(([k,v])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),v]));
 const actual=(await db.query('select shop_estimate_authorization_totals($1) result',[JSON.stringify({shop_id:A,...snake})])).rows[0].result;
 const expected=taxContext.window.shopEstimateTax.totals(model,{taxable:true,rate:7});
 for(const k of ['subtotal','tax','total'])assert.equal(actual[k],expected[k]);
}
console.log('Client/server tax parity: fee flags, discounts, cents and zero-floor totals passed.');
await db.close();
