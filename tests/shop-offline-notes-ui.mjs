import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../pages/Shop/shop-offline-notes.js',import.meta.url),'utf8');const window={};vm.runInNewContext(src,{window});const api=window.shopOfflineNotes;
const data=new Map(),storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const context={shopId:'shop-a',user:{id:'user-a'}},other={shopId:'shop-b',user:{id:'user-a'}};const p={shop:'shop-a',actor:'user-a',request:'request-a',ro:'ro-a',label:'123',expected:'2026-10-27T00:00:00Z',note:'offline work note',state:'pending'};
const key=api.keyFor(context,p.request);storage.setItem(key,JSON.stringify(p));assert.equal(api.list(context,storage).length,1);assert.equal(api.list(other,storage).length,0);
let calls=[],lose=true;const client={async rpc(name,args){calls.push(JSON.stringify(args));if(lose){lose=false;return {error:{message:'response lost'}}}return {data:{status:'saved'}}}};
assert.equal(await api.send(client,storage,api.list(context,storage)[0]),'pending');assert.equal(data.size,1);assert.equal(await api.send(client,storage,api.list(context,storage)[0]),'saved');assert.equal(calls[0],calls[1]);assert.equal(data.size,0);
storage.setItem(key,JSON.stringify(p));assert.equal(await api.send({rpc:async()=>({data:{status:'conflict'}})},storage,api.list(context,storage)[0]),'conflict');assert.equal(api.list(context,storage)[0].state,'conflict');assert.equal(api.list(context,storage)[0].note,p.note);
storage.setItem(key,'{');assert.throws(()=>api.list(context,storage));console.log('Offline note queue: scoped storage, loss/replay, conflict preservation and unreadable data passed.');
{
 const elements=[];function element(tag){const e={tag,textContent:'',value:'',disabled:false,children:[],setAttribute(){},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]}};elements.push(e);return e;}
 let attached,events={},online=false,failStorage=false,requestCount=0;const map=new Map();
 const store={get length(){if(failStorage)throw Error('blocked');return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem(k,v){if(failStorage)throw Error('blocked');map.set(k,v)},removeItem:k=>map.delete(k)};
 const nav={get onLine(){return online}},win={localStorage:store,trackRightSupabase:{rpc:async()=>{requestCount++;return {data:{status:'saved'}}}},addEventListener:(n,fn)=>{events[n]=fn},confirm:()=>true};
 const input={value:'work completed',closest:()=>({after:e=>{attached=e}})};vm.runInNewContext(src,{window:win,navigator:nav,document:{createElement:element},crypto:{randomUUID:()=> 'request-1'}});
 const control=await win.shopOfflineNotes.mount({context,order:{recordId:'ro-a',id:'123',updatedAt:'2026-10-27T00:00:00Z'},noteInput:input});
 const save=attached.children.find(e=>e.textContent==='Save technician note to device');save.onclick();assert.equal(map.size,1);assert.equal(requestCount,0);assert.equal(control.blocksOrderSave(),true);
 online=true;events.online();await new Promise(r=>setImmediate(r));assert.equal(map.size,0);assert.equal(requestCount,1);assert.equal(control.blocksOrderSave(),true,'page must reload after sync before a normal RO save');
 failStorage=true;save.onclick();assert.match(attached.children[2].textContent,/not saved/i);
 console.log('Offline note mount: offline device save, reconnect sync, normal-save guard and storage failure passed.');
}
