import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/shop-repair-orders-data.js',import.meta.url),'utf8');
async function fixture({confirm=true,failedRead=false}={}) {
 const calls=[],lines=[{part_number:'FILTER',quantity:2,stock_unit:'each'}],manifest=[{id:'s',number:2,revision:3,lines}],row={id:'ro',ro_number:1,shop_id:'a',status:'In Progress',estimate_stock_lines:[]};let prompt='';
 const client={rpc:async(name,args)=>{calls.push({name,args});return name==='get_shop_supplement_stock'?{data:manifest,error:failedRead?Error('Unavailable'):null}:{};},from(){return {select(){return this;},eq(){return this;},order:async()=>({data:[row]}),update(value){calls.push({name:'update',value});return this;},single:async()=>({data:{...row,status:'Ready for Payment'}})};}};
 const c={window:{trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'a',role:'service_writer',user:{id:'writer'}}),confirm:s=>{prompt=s;return confirm;}},console};vm.runInNewContext(source,c);
 const order=await c.window.trackRightRepairOrders.get('ro');return {calls,manifest,prompt:()=>prompt,finish:()=>c.window.trackRightRepairOrders.update({...order,status:'Ready for Payment'})};
}
let f=await fixture();await f.finish();assert.match(f.prompt(),/Supplement 2 · Rev. 3 — FILTER: 2 each/);assert.deepEqual(f.calls.map(x=>x.name),['get_shop_supplement_stock','confirm_shop_all_ro_stock','update']);assert.deepEqual(f.calls[1].args.p_supplements,f.manifest);
f=await fixture({confirm:false});await assert.rejects(f.finish(),/canceled/);assert.deepEqual(f.calls.map(x=>x.name),['get_shop_supplement_stock']);
f=await fixture({failedRead:true});await assert.rejects(f.finish(),/Unavailable/);assert.equal(f.calls.length,1);
const retSource=fs.readFileSync(new URL('../pages/Shop/shop-supplement-stock.js',import.meta.url),'utf8');
async function returnFixture({storageFailure=false,denied=false}={}){
 const storage=new Map(),calls=[],messages=[];let count=0,prompts=0,ids=0;
 const ctx={window:{trackRightAuthReady:Promise.resolve({shopId:'a',user:{id:'owner'}}),prompt:q=>{prompts++;return q.startsWith('Quantity')?'1':'QA physical return';},confirm:()=>true,trackRightSupabase:{rpc:async(name,args)=>{calls.push({name,args});return denied?{error:{code:'P0001',message:'Denied'}}:++count===1?{error:{message:'Connection lost'}}:{};}}},localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(storageFailure)throw Error('Storage blocked');storage.set(k,v);},removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>`request-${++ids}`}};
 vm.runInNewContext(retSource,ctx);const run=(item='part')=>ctx.window.shopSupplementStock.returnPart({id:1009},{id:'s',supplement_number:2},{item_id:item,part_number:'FILTER',stock_unit:'each'},m=>messages.push(m));return {storage,calls,messages,run,prompts:()=>prompts};
}
// An ambiguous result must retain exact request arguments for a deliberate retry.
let r=await returnFixture();await r.run();

assert.equal(r.storage.size,1);assert.equal(r.calls.length,1);await r.run('other');assert.equal(r.calls.length,1);await r.run();assert.equal(r.storage.size,0);assert.deepEqual(r.calls[0].args,r.calls[1].args);assert.equal(r.prompts(),2);
r=await returnFixture({storageFailure:true});await r.run();assert.equal(r.calls.length,0);
r=await returnFixture({denied:true});await r.run();assert.equal(r.storage.size,0);
console.log('Supplement stock UI: supplement-only consumption summary and exact revision confirmation, cancel/read failure without writes, source-specific durable return retries and storage-failure write blocking passed.');
