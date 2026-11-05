import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const shop='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ro='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const writer='11111111-1111-4111-8111-111111111111',tech='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
let sequence=0;
const request=()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table public.shops(id uuid primary key);insert into public.shops values('${shop}'),('${other}');
create table public.shop_repair_orders(id uuid primary key,shop_id uuid not null references public.shops(id),
complaint text,parts_needed text,customer_notes text,technician_notes text,additional_work_performed text,labor_hours numeric,priority text,
status text not null default 'In Progress',updated_at timestamptz not null default clock_timestamp());
insert into public.shop_repair_orders(id,shop_id,technician_notes,labor_hours,priority) values('${ro}','${shop}','before',0,'Medium');
create table public.test_access(actor uuid primary key,can_write boolean,can_work boolean,can_read boolean);
insert into public.test_access values('${writer}',true,true,true),('${tech}',false,true,true),('${outsider}',false,false,false);
create function public.shop_has_permission(uuid,text) returns boolean language sql stable as
$$select $1='${shop}'::uuid and coalesce((select can_write from public.test_access where actor=auth.uid()),false)$$;
create function public.shop_can_access_ro(uuid,text,text) returns boolean language sql stable as
$$select $1='${shop}'::uuid and $2='${ro}' and coalesce((select case when $3='read' then can_read else can_work end from public.test_access where actor=auth.uid()),false)$$;`);
const directory=new URL('../supabase/migrations/',import.meta.url);
const filename=fs.readdirSync(directory).find(name=>name.endsWith('_shop_offline_ro_sync.sql'));
assert(filename);
const sql=fs.readFileSync(new URL(filename,directory),'utf8');
await db.exec(sql);await db.exec(sql);
const actor=async id=>db.query("select set_config('test.actor',$1,false)",[id]);
const snapshot=async()=> (await db.query('select * from public.shop_repair_orders where id=$1',[ro])).rows[0];
async function invoke(patch,expected,key=request(),targetShop=shop){
 return (await db.query('select public.sync_shop_offline_ro($1,$2,$3,$4,$5) result',[targetShop,key,ro,expected,patch])).rows[0].result;
}
await actor(writer);
const baseline=await snapshot(),key=request();
const patch={complaint:'Engine stalls',parts_needed:'Review',customer_notes:'Call first',priority:'High'};
const saved=await invoke(patch,baseline.updated_at,key);
assert.equal(saved.status,'saved');
assert.deepEqual(await invoke(patch,baseline.updated_at,key),saved);
await assert.rejects(invoke({...patch,priority:'Low'},baseline.updated_at,key),/different details/);
assert.equal((await invoke({customer_notes:'stale'},baseline.updated_at)).status,'conflict');
for(const invalid of [{status:'Complete'},{estimate_total:0},{labor_hours:-1},{labor_hours:'2'},{priority:'Impossible'},{complaint:null},{complaint:'x'.repeat(20001)},{}]){
 await assert.rejects(invoke(invalid,saved.updated_at),/online save|Invalid/);
}
await assert.rejects(invoke({complaint:'foreign'},saved.updated_at,request(),other),/unavailable/);
await actor(tech);
await assert.rejects(invoke({customer_notes:'forbidden'},saved.updated_at),/unavailable/);
const techSaved=await invoke({technician_notes:'Checked fuel',labor_hours:1.5,additional_work_performed:'Inspection'},saved.updated_at);
assert.equal(techSaved.status,'saved');
await db.exec("update public.test_access set can_work=false where actor='"+tech+"'");
await assert.rejects(invoke({technician_notes:'Revoked'},techSaved.updated_at),/unavailable/);
await actor(outsider);await assert.rejects(invoke({complaint:'foreign actor'},techSaved.updated_at),/unavailable/);
await actor('');await assert.rejects(invoke({complaint:'anonymous'},techSaved.updated_at),/Invalid/);
await actor(writer);
await db.exec(`create function public.test_reject_operation() returns trigger language plpgsql as $$
begin raise exception 'TEST operation insert failure';end$$;
create trigger test_reject_operation before insert on public.shop_offline_ro_operations for each row execute function public.test_reject_operation();`);
const beforeFailure=await snapshot();
await assert.rejects(invoke({complaint:'Must roll back'},beforeFailure.updated_at),/TEST operation insert failure/);
assert.deepEqual(await snapshot(),beforeFailure);
await db.exec('drop trigger test_reject_operation on public.shop_offline_ro_operations;set role authenticated');
await assert.rejects(db.query('select * from public.shop_offline_ro_operations'),/permission denied/);
await db.exec('reset role;set role anon');
await assert.rejects(invoke({complaint:'anon RPC'},techSaved.updated_at),/permission denied/);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::integer as count from public.shop_offline_ro_operations')).rows[0].count,2);
assert.equal((await snapshot()).status,'In Progress');
await db.close();
console.log('Offline RO SQL passed: repeated migration, replay, conflicts, field restrictions, role and tenant checks, revocation, hidden ledger and atomic rollback.');
