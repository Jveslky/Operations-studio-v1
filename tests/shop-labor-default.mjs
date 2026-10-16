import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../pages/Shop/shop-repair-orders-data.js',import.meta.url),'utf8');
function fixture(rate=125,error=null) {
 const calls=[],writes=[];
 const client={from(table){const filters=[];return {select(columns){calls.push({table,columns,filters});return this;},eq(k,v){filters.push([k,v]);return this;},insert(row){writes.push(row);return this;},update(row){writes.push(row);return this;},async single(){return table==='shops'?{data:{default_labor_rate:rate},error}:{data:{...writes.at(-1),id:'ro-id',ro_number:1001},error:null};}};}};
 const ctx={window:{trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'shop-c',user:{id:'owner-c'},role:'owner'})},console};
 vm.runInNewContext(source,ctx);
 return{api:ctx.window.trackRightRepairOrders,calls,writes};
}
for(const value of [undefined,null,'']) {
 const f=fixture();const order={customerId:'customer-c'};if(value!==undefined)order.estimateLaborRate=value;
 const saved=await f.api.create(order);assert.equal(saved.estimateLaborRate,125);assert.equal(f.writes[0].estimate_labor_rate,125);
 const read=f.calls.find(c=>c.table==='shops');assert.ok(read.filters.some(([k,v])=>k==='id'&&v==='shop-c'));
}
for(const rate of [0,90]){const f=fixture();assert.equal((await f.api.create({estimateLaborRate:rate})).estimateLaborRate,rate);assert.equal(f.calls.some(c=>c.table==='shops'),false);}
for(const rate of [0,null])assert.equal((await fixture(rate).api.create({})).estimateLaborRate,0);
const failed=fixture(100,new Error('profile read denied'));await assert.rejects(failed.api.create({}),/profile read denied/);assert.equal(failed.writes.length,0);
const existing=fixture(200);await existing.api.update({recordId:'existing-ro',estimateLaborRate:95});assert.equal(existing.writes[0].estimate_labor_rate,95);assert.equal(existing.calls.some(c=>c.table==='shops'),false);
console.log('RO labor defaults: saved shop-scoped rate captured on creation, explicit zero/overrides retained, read failures stop inserts, existing rates unchanged.');
