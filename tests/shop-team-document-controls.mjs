import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
class Element {
 constructor(){this.children=[];this.events={};this.checked=false;}
 append(...x){this.children.push(...x);}appendChild(x){this.children.push(x);}replaceChildren(...x){this.children=x;}addEventListener(k,f){this.events[k]=f;}
}
const els=new Map();const get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>new Element()};
let record={id:'doc',shop_id:'shop',updated_at:'v1',archived_at:'old',visible_to_subject:true,title:'Test',subject_user_id:'tech',document_type:'license',original_filename:'test.pdf'};
let manage=true,fail=false,empty=false;const writes=[];
const client={rpc:async()=>({data:[]}),from:()=>({select:()=>({eq:()=>({order:async()=>({data:[{...record}]})})}),update:patch=>{
 const filters={};const q={eq(k,v){filters[k]=v;return q;},select(){return q;},async single(){writes.push({patch,filters});if(fail)return{error:{message:'offline'}};if(empty)return{data:null};record={...record,...patch};return{data:{id:record.id}};}};return q;
}})};
const context={shopId:'shop'};
vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/team-documents-settings.js',import.meta.url),'utf8'),{window:{trackRightSupabase:client,trackRightCan:()=>manage,trackRightAuthReady:Promise.resolve(context)},document,confirm:()=>true,Date,Map,Set,Object,console});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};await flush();
get('show-archived-documents').checked=true;get('show-archived-documents').events.change();
const actions=()=>get('team-document-list').children[0].children[2].children;
assert.deepEqual(actions().map(x=>x.textContent),['View','Restore']);
await actions()[1].events.click();await flush();assert.equal(record.archived_at,null);
assert.equal(writes[0].filters.shop_id,'shop');assert.equal(writes[0].filters.id,'doc');assert.equal(writes[0].filters.updated_at,'v1');
assert.deepEqual(actions().map(x=>x.textContent),['View','Archive','Hide from employee']);
await actions()[2].events.click();assert.equal(record.visible_to_subject,false);assert.equal(actions()[2].textContent,'Share with employee');
await actions()[2].events.click();assert.equal(record.visible_to_subject,true);
fail=true;await actions()[2].events.click();assert.equal(record.visible_to_subject,true);assert.match(get('team-document-message').textContent,/could not be confirmed/);assert.equal(actions()[2].disabled,false);
fail=false;empty=true;await actions()[2].events.click();assert.match(get('team-document-message').textContent,/changed or access/);assert.equal(record.visible_to_subject,true);
empty=false;manage=false;get('show-archived-documents').events.change();assert.deepEqual(actions().map(x=>x.textContent),['View']);
console.log('Team document controls: restore/share/hide/archive visibility, shop and stale-version filters, failed/zero-row saves, and management permission gates passed.');
