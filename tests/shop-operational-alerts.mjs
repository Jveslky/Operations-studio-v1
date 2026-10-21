import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const shop='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const owner='11111111-1111-1111-1111-111111111111',tech='22222222-2222-2222-2222-222222222222',foreign='33333333-3333-3333-3333-333333333333';
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key); create table shops(id uuid primary key);
create table shop_members(shop_id uuid,user_id uuid,role text,is_active boolean default true,can_read boolean default true);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function has_shop_role(s uuid,r text[]) returns boolean language sql stable security definer as $$select exists(select 1 from shop_members where shop_id=s and user_id=auth.uid() and is_active and role=any(r))$$;
create function shop_has_permission(s uuid,p text) returns boolean language sql stable security definer as $$select exists(select 1 from shop_members where shop_id=s and user_id=auth.uid() and is_active and (case when p='settings.manage' then role in('owner','admin') else can_read end))$$;
create table shop_repair_orders(id uuid primary key default gen_random_uuid(),shop_id uuid,ro_number bigint,technician_user_id uuid,additional_technician_user_id uuid,complaint text);
create function shop_can_access_ro(s uuid,r text,a text) returns boolean language sql stable security definer as $$select exists(select 1 from shop_repair_orders where id::text=r and shop_id=s) and shop_has_permission(s,'repair_orders.read')$$;
create table shop_estimate_approvals(id uuid primary key default gen_random_uuid(),shop_id uuid,repair_order_id uuid);
insert into shops values('${shop}'),('${other}'); insert into auth.users values('${owner}'),('${tech}'),('${foreign}');
insert into shop_members(shop_id,user_id,role) values('${shop}','${owner}','owner'),('${shop}','${tech}','technician'),('${other}','${foreign}','owner');
grant usage on schema auth to authenticated;
`);
const migration=fs.readFileSync(new URL('../supabase/shop-personal-alerts-20261021.sql',import.meta.url),'utf8');
await db.exec(migration);await db.exec(migration);
async function as(user){await db.exec(`reset role; set role authenticated; select set_config('test.user','${user}',false)`);}
async function root(){await db.exec('reset role');}
async function rpc(name,args){return (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}
async function feed(){return rpc('list_my_shop_alerts',[shop]);}
await root();
await db.exec(`
create table shop_inventory_items(id uuid primary key default gen_random_uuid(),shop_id uuid,part_number text,reorder_point numeric default 2,archived boolean default false,unique(shop_id,id));
create table shop_inventory_movements(id uuid primary key default gen_random_uuid(),shop_id uuid,item_id uuid,quantity numeric);
create table shop_ro_stock_events(id uuid primary key default gen_random_uuid(),shop_id uuid,item_id uuid,stock_delta numeric,hold_delta numeric);
create function shop_stock_counts(s uuid,i uuid) returns table(on_hand numeric,on_hold numeric,available numeric) language sql volatile as $$
 select stock,held,stock-held from(select coalesce((select sum(quantity) from shop_inventory_movements where shop_id=s and item_id=i),0)+coalesce((select sum(stock_delta) from shop_ro_stock_events where shop_id=s and item_id=i),0) stock,coalesce((select sum(hold_delta) from shop_ro_stock_events where shop_id=s and item_id=i),0) held)x$$;
create function shop_inventory_can(s uuid,a text) returns boolean language sql stable as $$select has_shop_role(s,array['owner','admin','service_writer']) and shop_has_permission(s,'inventory.read')$$;
create table shop_invoices(id uuid primary key default gen_random_uuid(),shop_id uuid);
create table shop_invoice_payments(id uuid primary key default gen_random_uuid(),shop_id uuid,invoice_id uuid,amount numeric,method text default 'cash',restored_from_backup boolean default false,reverses_id uuid);
create table shop_team_documents(id uuid primary key default gen_random_uuid(),shop_id uuid,subject_user_id uuid,visible_to_subject boolean default false,archived_at timestamptz);
create table shop_requests(id uuid primary key default gen_random_uuid(),shop_id uuid,request_type text,status text default 'pending');
`);
const sql=fs.readFileSync(new URL('../supabase/shop-operational-alerts-20261021.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
const item=(await db.query('insert into shop_inventory_items(shop_id,part_number) values($1,$2) returning id',[shop,'FILTER'])).rows[0].id;
async function movement(q){await root();await db.query('insert into shop_inventory_movements(shop_id,item_id,quantity) values($1,$2,$3)',[shop,item,q]);}
async function hold(stock,held){await root();await db.query('insert into shop_ro_stock_events(shop_id,item_id,stock_delta,hold_delta) values($1,$2,$3,$4)',[shop,item,stock,held]);}
await movement(5);await hold(0,3);
await as(owner);let f=await feed();assert.equal(f.items.length,1);assert.equal(f.items[0].event_type,'stock_low');assert.equal(f.unread,1);
await hold(0,0);await as(owner);assert.equal((await feed()).items.length,1);
await hold(-3,-3);await as(owner);assert.equal((await feed()).items.length,1); // Consumption preserves available quantity.
await movement(5);await as(owner);f=await feed();assert.ok(f.items[0].resolved_at);assert.equal(f.unread,0);
await hold(0,5);await as(owner);assert.equal((await feed()).items.length,2);assert.equal((await feed()).unread,1);
await as(tech);assert.equal((await feed()).items.length,0);await assert.rejects(rpc('save_my_shop_alert_preference',[shop,'stock_low',true]),/unavailable/);
await root();
const doc=(await db.query('insert into shop_team_documents(shop_id,subject_user_id) values($1,$2) returning id',[shop,tech])).rows[0].id;
await as(tech);assert.equal((await feed()).items.length,0);
await root();await db.query('update shop_team_documents set visible_to_subject=true where id=$1',[doc]);
await as(tech);assert.equal((await feed()).items.length,1);assert.equal((await feed()).items[0].event_type,'team_document_shared');
await root();await db.query('update shop_team_documents set visible_to_subject=false where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,0);
await root();await db.query('update shop_team_documents set visible_to_subject=true where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,1);
await root();await db.query('update shop_team_documents set archived_at=now() where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,0);
await root();await db.query('update shop_team_documents set archived_at=null where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,1);
await root();await db.query('update shop_team_documents set visible_to_subject=false where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,0);
await root();await db.query('update shop_team_documents set visible_to_subject=true where id=$1',[doc]);await as(tech);assert.equal((await feed()).items.length,1);
await root();await db.query('update shop_team_documents set archived_at=now() where id=$1',[doc]);
await root();const req=(await db.query("insert into shop_requests(shop_id,request_type) values($1,'pto') returning id",[shop])).rows[0].id;
await as(owner);f=await feed();assert.equal(f.items.filter(x=>x.event_type==='pto_requested').length,1);
await root();await db.query("update shop_requests set status='approved' where id=$1",[req]);await as(owner);assert.ok((await feed()).items.find(x=>x.event_type==='pto_requested').resolved_at);
await as(tech);assert.equal((await rpc('my_shop_alert_preferences',[shop])).some(x=>x.event_type==='pto_requested'),false);
await root();const inv=(await db.query('insert into shop_invoices(shop_id) values($1) returning id',[shop])).rows[0].id;
const payment=(await db.query('insert into shop_invoice_payments(shop_id,invoice_id,amount) values($1,$2,25) returning id',[shop,inv])).rows[0].id;
await as(owner);assert.equal((await feed()).items.filter(x=>x.event_type==='payment_recorded').length,1);
await root();await db.query("insert into shop_invoice_payments(shop_id,invoice_id,amount,reverses_id) values($1,$2,-25,$3)",[shop,inv,payment]);
await db.query("insert into shop_invoice_payments(shop_id,invoice_id,amount,restored_from_backup) values($1,$2,25,true)",[shop,inv]);
await as(owner);f=await feed();assert.equal(f.items.filter(x=>x.event_type==='payment_recorded').length,1);assert.ok(f.items.find(x=>x.event_type==='payment_recorded').resolved_at);
await as(foreign);await assert.rejects(feed(),/unavailable/);
await root();await db.exec('begin');await db.query("insert into shop_requests(shop_id,request_type) values($1,'pto')",[shop]);await db.exec('rollback');await as(owner);assert.equal((await feed()).items.filter(x=>x.event_type==='pto_requested').length,1);
await assert.rejects(rpc('deliver_shop_operational_alert',[shop,'pto_requested',req,req,'forged',[tech]]),/permission denied/);
await root();await db.query('update shop_members set can_read=false where user_id=$1',[owner]);await as(owner);assert.equal((await feed()).items.length,0);
console.log('Operational alerts: low-stock episodes and resolution, stock consumption, private/shared/archived documents, PTO review, recorded payments and reversals, restored-history suppression, role/tenant isolation and rollback passed.');
await db.close();
