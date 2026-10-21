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
const ro=(await db.query('insert into shop_repair_orders(shop_id,ro_number,technician_user_id,additional_technician_user_id) values($1,1,$2,$2) returning id',[shop,tech])).rows[0].id;
await as(tech);let f=await feed();assert.equal(f.unread,1);assert.equal(f.items.length,1);
await assert.rejects(db.query('insert into shop_alert_events(shop_id,event_type,source_id,repair_order_id,title) values($1,$2,$3,$4,$5)',[shop,'ro_assigned',ro,ro,'Forged']),/permission denied/);
await assert.rejects(rpc('deliver_shop_alert',[shop,'ro_assigned',ro,ro,'Forged',[tech]]),/permission denied/);
await rpc('read_my_shop_alert',[shop,f.items[0].id]);assert.equal((await feed()).unread,0);
await rpc('read_my_shop_alert',[shop,f.items[0].id]);
await as(foreign);await assert.rejects(feed(),/unavailable/);await assert.rejects(rpc('read_my_shop_alert',[shop,f.items[0].id]),/unavailable/);
await root();await db.query('update shop_repair_orders set complaint=$1,technician_user_id=$2 where id=$3',['refresh/save',tech,ro]);
await as(tech);assert.equal((await feed()).items.length,1);
await rpc('save_my_shop_alert_preference',[shop,'estimate_approved',false]);
await root();await db.query('insert into shop_estimate_approvals(shop_id,repair_order_id) values($1,$2)',[shop,ro]);
await as(tech);assert.equal((await feed()).items.length,1);
await assert.rejects(rpc('save_shop_alert_rule',[shop,'estimate_approved',true,true]),/unavailable/);
await as(owner);await rpc('save_shop_alert_rule',[shop,'estimate_approved',true,true]);
await as(tech);await assert.rejects(rpc('save_my_shop_alert_preference',[shop,'estimate_approved',false]),/controlled/);
await root();await db.query('insert into shop_estimate_approvals(shop_id,repair_order_id) values($1,$2)',[shop,ro]);
await as(tech);assert.equal((await feed()).items.length,2);assert.equal((await feed()).unread,1);
// Current assignment and permission removal immediately revoke access to old alert content.
await root();await db.query('update shop_repair_orders set technician_user_id=null,additional_technician_user_id=null where id=$1',[ro]);
await as(tech);assert.equal((await feed()).items.length,0);
await root();await db.query('update shop_repair_orders set technician_user_id=$1 where id=$2',[tech,ro]);
await as(tech);assert.equal((await feed()).items.length,3);
await root();await db.query('update shop_members set can_read=false where user_id=$1',[tech]);
await as(tech);await assert.rejects(feed(),/unavailable/);
await root();await db.query('update shop_members set can_read=true,is_active=false where user_id=$1',[tech]);
await as(tech);await assert.rejects(feed(),/unavailable/);
await root();await db.query('update shop_members set is_active=true where user_id=$1',[tech]);
// Rollback leaves neither event nor delivery; replaying a committed source is deduplicated.
await db.exec('begin');const a=(await db.query('insert into shop_estimate_approvals(shop_id,repair_order_id) values($1,$2) returning id',[shop,ro])).rows[0].id;await db.exec('rollback');
assert.equal((await db.query('select count(*)::int n from shop_alert_events where source_id=$1',[a])).rows[0].n,0);
const event=(await db.query("select source_id from shop_alert_events where event_type='estimate_approved' limit 1")).rows[0];
const count=(await db.query('select count(*)::int n from shop_alert_inbox')).rows[0].n;
await rpc('deliver_shop_alert',[shop,'estimate_approved',event.source_id,ro,'duplicate',[tech]]);
assert.equal((await db.query('select count(*)::int n from shop_alert_inbox')).rows[0].n,count);
await as(owner);await rpc('save_shop_alert_rule',[shop,'ro_assigned',false,false]);
await root();await db.query('update shop_repair_orders set technician_user_id=null where id=$1',[ro]);await db.query('update shop_repair_orders set technician_user_id=$1 where id=$2',[tech,ro]);
assert.equal((await db.query('select count(*)::int n from shop_alert_inbox')).rows[0].n,count);
console.log('Personal alerts: transaction safety, deduplication, recipient isolation, revocation, preferences and shop controls passed.');
await db.close();
