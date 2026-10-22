import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
class Element {
 constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.events={};this.style={};this.open=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;} addEventListener(k,f){this.events[k]=f;}
 showModal(){this.open=true;}close(){this.open=false;}
}
const body=new Element('body'),header=new Element('header'),document={body,head:new Element('head'),hidden:false,createElement:t=>new Element(t),createTextNode:t=>new Element('text',t),getElementById:()=>null};
let items=[{id:'event',title:'Assigned RO',repair_order_id:'ro',created_at:'2026-10-21',read_at:null}],fail=false;const calls=[];
const settings=[{event_type:'ro_assigned',enabled:true,available:true,required:false},{event_type:'estimate_approved',enabled:false,available:true,required:true}];
const client={rpc:async(name,args)=>{calls.push({name,args});if(fail)return {error:{message:'offline'}};
 if(name==='list_my_shop_alerts')return {data:{unread:items.filter(x=>!x.read_at).length,items}};
 if(name==='my_shop_alert_preferences')return {data:settings};
 if(name==='read_my_shop_alert')items=items.map(x=>({...x,read_at:'now'}));
 return {data:null};}};
body.classList={contains:()=>false};
const emitted=[];const window={addEventListener(){},dispatchEvent(e){emitted.push(e)}};vm.runInNewContext(fs.readFileSync(new URL('../js/alerts.js',import.meta.url),'utf8'),{window,document,setInterval:()=>1,clearInterval(){},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},console});
window.LongShiftAlerts.mount({client,context:{shopId:'shop',role:'technician'},header,rootPath:'../../'});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
await flush();const button=header.children[0];assert.equal(button.textContent,'Alerts (1)');
button.events.click();await flush();const dialog=body.children[0];assert.equal(dialog.open,true);
const list=dialog.children[4],prefs=dialog.children[5];
assert.equal(list.children[1].children[0].href,'../../pages/Shop/repair-order-details.html?id=ro');
const checkbox=prefs.children[2].children[0].children[0];checkbox.checked=false;await checkbox.events.change();assert.equal(calls.at(-1).name,'save_my_shop_alert_preference');assert.equal(calls.at(-1).args.p_shop,'shop');
const required=prefs.children[3].children[0].children[0];assert.equal(required.disabled,true);assert.equal(required.checked,true);
fail=true;checkbox.checked=true;await checkbox.events.change();assert.equal(checkbox.checked,false);assert.match(dialog.children[3].textContent,/offline/);
const read=list.children[1].children[2];await read.events.click();assert.equal(read.disabled,false);assert.equal(button.textContent,'Alerts (1)');
fail=false;await read.events.click();await flush();assert.equal(button.textContent,'Alerts');assert.equal(list.children[1].children[2].disabled,true);
items=[{id:'stock',event_type:'stock_low',source_record_id:'part',title:'Stock',created_at:'2026-10-21',resolved_at:'now'},
{id:'payment',event_type:'payment_recorded',title:'Payment',created_at:'2026-10-21'},
{id:'pto',event_type:'pto_requested',title:'PTO',created_at:'2026-10-21'},
{id:'doc',event_type:'team_document_shared',title:'Document',created_at:'2026-10-21'}];
await dialog.children[2].events.click();await flush();
assert.equal(list.children[1].children[0].href,'../../pages/Shop/inventory.html');
assert.match(list.children[1].children[0].textContent,/Resolved/);
assert.equal(list.children[2].children[0].href,'../../pages/Shop/invoices.html');
assert.equal(list.children[3].children[0].href,'../../pages/Shop/shop-settings.html#requests');
assert.equal(list.children[4].children[0].href,'../../pages/Shop/technician-dashboard.html#tech-document-list');
dialog.children[1].events.click();assert.equal(dialog.open,false);
console.log('Personal alerts UI: modal, links, scoped preferences, required controls, failed save rollback and confirmed read count passed.');

assert.ok(emitted.some(e=>e.type==='longshift:alerts'),'authoritative feeds reach utility bar');
