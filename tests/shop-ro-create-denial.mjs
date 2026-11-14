import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/shop-repair-orders-data.js',import.meta.url),'utf8');
for(const [access,pattern] of [[{data:true},/session allows/],[{data:false},/session does not allow/],[{error:{message:'Unavailable'}},/^Assignment permission required$/]]) {
 let inserts=0,reads=0;
 const original=new Error('Assignment permission required');
 const client={from(){return {insert(){inserts++;return this;},select(){return this;},single:async()=>({error:original})};},rpc:async(name,args)=>{reads++;assert.equal(name,'shop_has_permission');assert.equal(args.requested_permission,'repair_orders.write');return access;}};
 const ctx={window:{trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'qa',role:'service_writer',user:{id:'writer'}})},console};
 vm.runInNewContext(source,ctx);
 await assert.rejects(ctx.window.trackRightRepairOrders.create({estimateLaborRate:100}),error=>pattern.test(error.message));
 assert.equal(inserts,1);assert.equal(reads,1);
}
console.log('Writer creation diagnostics: allowed, denied and unavailable permission checks; no duplicate insert or automatic retry passed.');
