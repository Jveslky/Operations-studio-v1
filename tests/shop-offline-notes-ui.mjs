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

// A reviewed version is persisted separately from the original and retried unchanged.
{
 const original={...p,state:'conflict',resolution:{request:'review-request',expected:'new-version',note:'reviewed note'}};
 storage.setItem(key,JSON.stringify(original));let attempts=[];
 const lost={rpc:async(_name,args)=>{attempts.push(JSON.stringify(args));return {error:{message:'lost'}}}};
 assert.equal(await api.send(lost,storage,api.list(context,storage)[0]),'pending');
 assert.equal(api.list(context,storage)[0].note,p.note);
 const conflict={rpc:async(_name,args)=>{attempts.push(JSON.stringify(args));return {data:{status:'conflict'}}}};
 assert.equal(await api.send(conflict,storage,api.list(context,storage)[0]),'conflict');
 const saved=api.list(context,storage)[0];assert.equal(saved.note,p.note);assert.equal(saved.reviewDraft,'reviewed note');assert.equal(saved.resolution,undefined);assert.equal(attempts[0],attempts[1]);
 storage.setItem(key,JSON.stringify(original));assert.equal(await api.send({rpc:async()=>({data:{status:'saved'}})},storage,api.list(context,storage)[0]),'saved');assert.equal(storage.getItem(key),null);
 console.log('Conflict review: original and draft survive lost responses and renewed conflicts; confirmation clears the device copy.');
}
{
 const map=new Map(), store={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const original={...p,state:'conflict'};store.setItem(key,JSON.stringify(original));let attached,online=true,sendCalls=[];
 function element(tag){return {tag,textContent:'',value:'',children:[],setAttribute(){},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]}};}
 const win={localStorage:store,trackRightSupabase:{from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{technician_notes:'shop version',updated_at:'current-version'}})})})})}),rpc:async(_n,args)=>{sendCalls.push(args);return {data:{status:'saved'}}}},addEventListener(){},confirm:()=>true};
 const input={value:'shop version',closest:()=>({after:e=>{attached=e}})};
 vm.runInNewContext(src,{window:win,navigator:{get onLine(){return online}},document:{createElement:element},crypto:{randomUUID:()=> 'review-1'}});
 const control=await win.shopOfflineNotes.mount({context,order:{recordId:'ro-a',id:'123',updatedAt:'current-version'},noteInput:input});
 const queue=attached.children[5];await queue.children[0].children.find(x=>x.textContent==='Review conflict').onclick();
 const row=queue.children[0], edit=row.children.find(x=>x.tag==='textarea'&&!x.readOnly);assert.equal(edit.value,'shop version');edit.value='shop version\noffline work note';
 await row.children.find(x=>x.textContent==='Save reviewed note').onclick();
 assert.equal(sendCalls[0].p_expected,'current-version');assert.equal(sendCalls[0].p_note,'shop version\noffline work note');assert.equal(map.size,0);assert.equal(control.blocksOrderSave(),true);
 console.log('Conflict review UI: loads latest note, submits explicit reviewed text, and guards later saves.');
}
// Denials, expired sessions and transport failures remain distinct across reloads.
for(const [response,issue,wording] of [
 [{status:400,error:{code:'P0001',message:'Repair order is unavailable'}},'access',/Access denied/],
 [{status:403,error:{code:'42501',message:'denied'}},'access',/Access denied/],
 [{status:401,error:{code:'PGRST301',message:'expired'}},'session',/Sign-in required/],
 [{status:0,error:{message:'Failed to fetch'}},'connection',/could not confirm a response/],
 [{status:500,error:{code:'XX000',message:'private server details'}},'server',/shop could not complete/]
]){
 const map=new Map(),store={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const original={...p,resolution:undefined};store.setItem(key,JSON.stringify(original));let attached,reply=response,calls=[];
 function element(tag){return {tag,textContent:'',value:'',children:[],setAttribute(){},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]}};}
 const win={localStorage:store,trackRightSupabase:{rpc:async(_n,args)=>{calls.push(JSON.stringify(args));return reply;}},addEventListener(){},confirm:()=>true};
 vm.runInNewContext(src,{window:win,navigator:{onLine:true},document:{createElement:element},crypto:{randomUUID:()=> 'unused'}});
 await win.shopOfflineNotes.mount({context,order:{recordId:'ro-a',id:'123',updatedAt:p.expected},noteInput:{value:'',closest:()=>({after:e=>{attached=e}})}});
 await new Promise(r=>setImmediate(r));const kept=win.shopOfflineNotes.list(context,store)[0];assert.equal(kept.note,p.note);assert.equal(kept.syncIssue,issue);assert.match(attached.children[5].children[0].children[0].textContent,wording);assert.doesNotMatch(store.getItem(key),/private server details/);
 reply={data:{status:'saved'}};await attached.children.find(e=>e.textContent==='Sync saved notes').onclick();assert.equal(map.size,0);assert.equal(calls[0],calls[1],'restored access retries original operation');
}
{
 const reviewed={...p,state:'conflict',resolution:{request:'review-denied',expected:'latest',note:'merged draft'}};
 storage.setItem(key,JSON.stringify(reviewed));assert.equal(await api.send({rpc:async()=>({status:400,error:{code:'P0001',message:'Repair order is unavailable'}})},storage,api.list(context,storage)[0]),'pending');
 const kept=api.list(context,storage)[0];assert.equal(kept.syncIssue,'access');assert.equal(kept.note,p.note);assert.equal(JSON.stringify(kept.resolution),JSON.stringify(reviewed.resolution));
 assert.equal(await api.send({rpc:async()=>{throw Error('offline')}},storage,kept),'pending');assert.equal(api.list(context,storage)[0].syncIssue,'connection');
 assert.equal(await api.send({rpc:async()=>({data:{status:'conflict'}})},storage,api.list(context,storage)[0]),'conflict');assert.equal(api.list(context,storage)[0].syncIssue,undefined);assert.equal(api.list(context,storage)[0].reviewDraft,'merged draft');
}
console.log('Sync failure UI: access/session/network/server distinction, persisted reasons, unchanged retries and reviewed-note preservation passed.');
