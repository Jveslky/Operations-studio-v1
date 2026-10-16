import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',writer='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',tech='33333333-3333-3333-3333-333333333333';
await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key,email text);create table shops(id uuid primary key,updated_at timestamptz default now(),timezone text default 'UTC');create table members(shop_id uuid,user_id uuid,role text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function has_shop_role(s uuid,r text[]) returns boolean language sql stable security definer as $$select exists(select 1 from members where shop_id=s and user_id=auth.uid() and role=any(r))$$;
create function is_shop_member(s uuid) returns boolean language sql stable security definer as $$select exists(select 1 from members where shop_id=s and user_id=auth.uid())$$;
insert into shops(id) values('${A}'),('${B}');insert into auth.users values('${writer}','writer@test'),('${other}','other@test'),('${tech}','tech@test');insert into members values('${A}','${writer}','service_writer'),('${B}','${other}','owner'),('${A}','${tech}','technician');
create table "Customers"(id uuid primary key,shop_id uuid,name text,contact_name text,phone text,email text,created_at timestamptz default now(),archived boolean default false);
create table customer_units(id uuid,shop_id uuid,customer_id uuid,name text,year integer,make text,model text,serial text,archived boolean default false);
insert into "Customers"(id,shop_id,name) values('${writer}','${A}','Jon');
grant select on shops to authenticated;grant usage on schema auth to authenticated;grant select on "Customers",customer_units to authenticated;`);
await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
for(const f of ['shop-repair-orders.sql','shop-estimate-approvals.sql','shop-approval-scope-repair-20261011.sql','shop-invoices.sql','shop-supplemental-estimates-20261011.sql'])await db.exec(fs.readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8'));
await db.exec(`select set_config('test.user','${writer}',false);`);
const sql=fs.readFileSync(new URL('../supabase/shop-payment-ledger-20261014.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
await db.exec(`create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/')$$;`);
await db.exec(fs.readFileSync(new URL('../supabase/customer-tax-settings.sql',import.meta.url),'utf8'));
const billingSQL=fs.readFileSync(new URL('../supabase/shop-customer-billing-20261014.sql',import.meta.url),'utf8');await db.exec(billingSQL);await db.exec(billingSQL);

const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const one=async(sql,args=[]) => (await q(sql,args))[0];
const migration=fs.readFileSync(new URL('../supabase/shop-ready-payment-drafts-20261015.sql',import.meta.url),'utf8');
const previous=await one("insert into shop_repair_orders(shop_id,status) values($1,'Ready for Payment') returning *",[A]);
await db.exec(migration);await db.exec(migration);
assert.equal((await q('select * from shop_invoices')).length,0,'migration has no backfill');
await db.query('update shops set default_taxable=true,default_tax_rate=6,timezone=$2 where id=$1',[A,'America/New_York']);
await db.exec('set role authenticated');
const make=async() => one("insert into shop_repair_orders(shop_id,customer_id,customer_name,unit_name,complaint,estimate_labor_hours,estimate_labor_rate,estimate_total) values($1,$2,'QA Customer','QA Unit','Test repair',1,100,100) returning *",[A,writer]);
const finish=async(ro) => one("update shop_repair_orders set status='Ready for Payment' where id=$1 returning *",[ro.id]);
const invoice=async(ro) => one('select * from shop_invoices where repair_order_id=$1',[ro.id]);
const status=async(ro) => (await one('select status from shop_repair_orders where id=$1',[ro.id])).status;
await db.query("update shop_repair_orders set complaint='No backfill on unrelated edit' where id=$1",[previous.id]);
assert.equal(await invoice(previous),undefined);
const ro=await make();await finish(ro);let draft=await invoice(ro);
assert.equal(draft.status,'Draft');assert.equal(Number(draft.subtotal),100);assert.equal(Number(draft.tax_amount),6);assert.equal(Number(draft.total),106);assert.equal(Number(draft.balance_due),106);
assert.equal(draft.created_by,writer);assert.ok(draft.created_at);assert.equal(draft.fee_snapshot.creationSource,'ready-for-payment');
assert.equal(draft.customer_name,'QA Customer');assert.equal(draft.unit_name,'QA Unit');assert.equal(draft.complaint,'Test repair');assert.equal(draft.repair_order_number,ro.ro_number);
assert.equal(draft.tax_snapshot.rate,6);assert.equal(draft.billing_snapshot.termsDays,0);assert.equal(draft.sent_at,null);assert.equal(await status(ro),'Ready for Payment');
assert.equal(draft.due_date.toISOString().slice(0,10),(await one("select (now() at time zone 'America/New_York')::date::text d")).d);
await finish(ro);await db.query("update shop_repair_orders set status='In Progress' where id=$1",[ro.id]);await finish(ro);
assert.equal((await invoice(ro)).id,draft.id);assert.equal((await q('select * from shop_invoices where repair_order_id=$1',[ro.id])).length,1);
await assert.rejects(db.query('insert into shop_invoices(shop_id,repair_order_id,subtotal) values($1,$2,100)',[A,ro.id]),/unique/);

// A manually created invoice, including an issued one, is never replaced.
const manualRO=await make();const manual=await one("insert into shop_invoices(shop_id,repair_order_id,subtotal,total,status) values($1,$2,77,77,'Sent') returning *",[A,manualRO.id]);
await finish(manualRO);assert.equal((await invoice(manualRO)).id,manual.id);assert.equal(Number((await invoice(manualRO)).total),81.62);

// Fee tax flags, discount, approved supplements, and pending work use saved rows.
const priced=await make();await db.query('update shop_repair_orders set estimate_parts_total=50,estimate_shop_supplies=10,estimate_shop_supplies_taxable=true,estimate_environmental_fee=20,estimate_environmental_fee_taxable=false,estimate_other_charges=5,estimate_misc_fee_taxable=true,estimate_misc_fee_label=$2,estimate_discount=15 where id=$1',[priced.id,'Special fee']);
const supplement=await one('select * from save_shop_supplement($1,null,null,$2)',[priced.id,JSON.stringify({description:'Extra repair',labor_hours:1,labor_rate:50,parts_total:10,other_charges:5,other_taxable:false,discount:5,status:'Draft'})]);
await assert.rejects(finish(priced),/Approve or decline/);assert.equal(await status(priced),'Open');assert.equal(await invoice(priced),undefined);
await db.query('select approve_shop_supplement($1,$2,$3,$4)',[supplement.id,supplement.updated_at,supplement.revision,JSON.stringify({method:'verbal',customer_contact:'QA',notes:'Approved on phone'})]);
await finish(priced);const pricedInvoice=await invoice(priced);
assert.equal(Number(pricedInvoice.subtotal),230);assert.equal(Number(pricedInvoice.tax_snapshot.taxableBase),205);assert.equal(Number(pricedInvoice.tax_amount),12.3);assert.equal(Number(pricedInvoice.total),242.3);
assert.equal(pricedInvoice.fee_snapshot.supplements.length,1);assert.equal(pricedInvoice.fee_snapshot.miscellaneousFeeLabel,'Special fee');

// Customer exemption, billing contacts/NET/PO, and issued snapshots remain intact.
await db.exec('reset role');await db.query("update members set role='owner' where user_id=$1",[writer]);await db.exec('set role authenticated');
const saveBilling=values => db.query('select save_shop_customer_billing($1,$2,$3)',[A,writer,JSON.stringify(values)]);
await saveBilling({tax_status:'exempt',terms_days:30,po_required:true,billing_email:'billing@example.test',billing_phone:'555-0100',account_status:'active'});
const netRO=await make();await finish(netRO);const net=await invoice(netRO);
assert.equal(Number(net.total),100);assert.equal(net.tax_snapshot.taxable,false);assert.equal(net.customer_email,'billing@example.test');assert.equal(net.customer_phone,'555-0100');assert.equal(net.billing_snapshot.termsDays,30);assert.equal(net.status,'Draft');assert.equal(await status(netRO),'Ready for Payment');
await assert.rejects(db.query("update shop_invoices set status='Sent' where id=$1",[net.id]),/purchase order/);
await db.query("update shop_invoices set status='Sent',purchase_order='QA-PO' where id=$1",[net.id]);assert.equal(await status(netRO),'Ready for Pickup');
await saveBilling({tax_status:'taxable',terms_days:0,po_required:false,account_status:'active'});
assert.equal((await invoice(netRO)).billing_snapshot.termsDays,30);assert.equal(Number((await invoice(netRO)).total),100);

// Fully paid existing invoice retains the established pickup automation.
await db.query("update shop_invoices set status='Sent' where id=$1",[draft.id]);
await db.query('select record_shop_invoice_payment($1,$2,106,$3,current_date,$4,$5)',[draft.id,crypto.randomUUID(),'cash','','QA payment']);
assert.equal(await status(ro),'Ready for Pickup');assert.equal((await invoice(ro)).status,'Paid');
await db.query("update shop_repair_orders set status='Complete' where id=$1",[ro.id]);assert.equal(await status(ro),'Complete');

// Technician work completion creates a system draft without granting financial writes.
const techRO=await make();await db.query("select set_config('test.user',$1,false)",[tech]);
await db.query('select update_shop_repair_order_work($1,$2,$3,1,$4)',[techRO.id,'Ready for Payment','Finished','']);
await assert.rejects(db.query("insert into shop_invoices(shop_id,subtotal,total) values($1,1,1)",[A]),/row-level security/);
await assert.rejects(db.query('select draft_shop_invoice_when_finished()'),/permission denied/);
await db.query("select set_config('test.user',$1,false)",[writer]);const techDraft=await invoice(techRO);assert.equal(techDraft.created_by,tech);assert.equal(techDraft.status,'Draft');assert.equal(Number(techDraft.total),106);
await db.query("select set_config('test.user',$1,false)",[other]);
assert.equal((await q("update shop_repair_orders set status='Ready for Payment' where id=$1 returning *",[techRO.id])).length,0);
await assert.rejects(db.query('select update_shop_repair_order_work($1,$2,$3,0,$4)',[techRO.id,'Ready for Payment','','']),/unavailable/);
await db.query("select set_config('test.user',$1,false)",[writer]);

// Archived and imported rows do not unexpectedly create invoices.
const archived=await make();await db.query('update shop_repair_orders set archived=true where id=$1',[archived.id]);await finish(archived);assert.equal(await invoice(archived),undefined);
const imported=await one("insert into shop_repair_orders(shop_id,status) values($1,'Ready for Payment') returning *",[A]);assert.equal(await invoice(imported),undefined);
const zero=await make();await db.query('update shop_repair_orders set estimate_labor_rate=0 where id=$1',[zero.id]);await finish(zero);assert.equal((await invoice(zero)).status,'Draft');assert.equal(Number((await invoice(zero)).total),0);
const invalid=await make();await assert.rejects(db.query("update shop_repair_orders set status='Ready for Payment',estimate_discount=-1 where id=$1",[invalid.id]),/nonnegative/);assert.equal(await status(invalid),'Open');assert.equal(Number((await one('select estimate_discount from shop_repair_orders where id=$1',[invalid.id])).estimate_discount),0);assert.equal(await invoice(invalid),undefined);
await db.close();
console.log('Automatic invoice drafts: atomic status/draft creation, tax/fees/supplements, pending-work rollback, duplicate/manual protection, NET/PO snapshots, payment routing, staff roles, isolation and no backfill passed.');
