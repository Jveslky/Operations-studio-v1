import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const shop='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',ro='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',tech='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',owner='33333333-3333-3333-3333-333333333333';
await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table shops(id uuid primary key);insert into shops values('${shop}');
create table shop_members(shop_id uuid,user_id uuid,role text,is_active boolean,permissions jsonb);insert into shop_members values
('${shop}','${tech}','technician',true,'{"repair_orders.read":true,"repair_orders.update_work":true}'),('${shop}','${other}','technician',true,'{"repair_orders.read":true,"repair_orders.update_work":true}'),('${shop}','${owner}','owner',true,'{"repair_orders.read":true,"repair_orders.write":true}');
create table shop_repair_orders(id uuid primary key,shop_id uuid,ro_number bigint,legacy_local_id text,technician_user_id uuid,additional_technician_user_id uuid,technician_notes text,updated_at timestamptz);insert into shop_repair_orders values('${ro}','${shop}',1028,null,'${tech}',null,'original','2026-10-27T00:00:00Z');
create function shop_has_permission(s uuid,p text) returns boolean language sql stable security definer as $$select coalesce((select (permissions->>p)::boolean from shop_members where shop_id=s and user_id=auth.uid() and is_active),false)$$;
create function shop_can_access_ro(target_shop uuid,reference text,action text default 'read') returns boolean language plpgsql stable security definer set search_path=public as $$
declare r public.shop_repair_orders; member_role text; matches integer; lookup_id uuid; lookup_number bigint;
begin select role into member_role from public.shop_members where shop_id=target_shop and user_id=auth.uid() and is_active;if member_role is null then return false;end if;
if reference ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then lookup_id:=reference::uuid;end if;
if reference ~ '^[0-9]{1,19}$' then begin lookup_number:=reference::bigint;exception when numeric_value_out_of_range then return false;end;end if;
select count(*) into matches from public.shop_repair_orders where shop_id=target_shop and (id=lookup_id or ro_number=lookup_number or legacy_local_id=reference);if matches<>1 then return false;end if;
select * into r from public.shop_repair_orders where shop_id=target_shop and (id=lookup_id or ro_number=lookup_number or legacy_local_id=reference);
if member_role='technician' and not coalesce(auth.uid() in (r.technician_user_id,r.additional_technician_user_id),false) then return false;end if;
return case action when 'read' then public.shop_has_permission(target_shop,'repair_orders.read') when 'work' then public.shop_has_permission(target_shop,'repair_orders.update_work') when 'assign' then member_role<>'technician' and public.shop_has_permission(target_shop,'repair_orders.assign') else false end;end $$;`);
await db.exec(fs.readFileSync(new URL('../supabase/shop-offline-note-sync-20261027.sql',import.meta.url),'utf8'));
const actor=async id=>db.query("select set_config('test.actor',$1,false)",[id]);const run=(id,n='queued note',expected='2026-10-27T00:00:00Z')=>db.query('select sync_shop_offline_note($1,$2,$3,$4,$5) result',[shop,id,ro,expected,n]);const id1='44444444-4444-4444-4444-444444444444',id2='55555555-5555-5555-5555-555555555555';
await actor(other);await assert.rejects(run(id1),/unavailable/);
await actor(tech);assert.equal((await run(id1)).rows[0].result.status,'saved');
await db.exec(`update shop_members set permissions='{"repair_orders.read":true,"repair_orders.update_work":false}' where user_id='${tech}'`);await assert.rejects(run(id1),/unavailable/);
await db.exec(`update shop_members set permissions='{"repair_orders.read":true,"repair_orders.update_work":true}' where user_id='${tech}';update shop_repair_orders set technician_user_id='${other}' where id='${ro}'`);await assert.rejects(run(id1),/unavailable/);
await db.exec(`update shop_repair_orders set technician_user_id='${tech}' where id='${ro}';update shop_members set is_active=false where user_id='${tech}'`);await assert.rejects(run(id2),/unavailable/);
await db.exec(`update shop_members set is_active=true where user_id='${tech}';update shop_repair_orders set technician_notes='newer server version',updated_at='2026-10-27T01:00:00Z' where id='${ro}'`);assert.equal((await run(id2,'stale device note')).rows[0].result.status,'conflict');assert.equal((await db.query('select technician_notes from shop_repair_orders')).rows[0].technician_notes,'newer server version');
await actor(owner);assert.equal((await run('66666666-6666-6666-6666-666666666666','office note','2026-10-27T01:00:00Z')).rows[0].result.status,'saved');await db.close();console.log('Offline note roles: assigned pass, unassigned/permission revoked/reassigned/inactive denied, stale conflict retained and owner pass. Fixture models supplied Test access function.');
