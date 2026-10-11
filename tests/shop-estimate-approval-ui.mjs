import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../pages/Shop/estimate-approval-audit.js',import.meta.url),'utf8');
async function fixture({available=true,allowed=true,failUpload=false,originalStatus='Draft'}={}) {
 const nodes=new Map(), uploads=[];
 const node=id=>{if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',checked:false,hidden:false,disabled:false,files:[],tagName:'INPUT',listeners:{},children:[],addEventListener(e,f){this.listeners[e]=f;},dispatchEvent(e){this.listeners[e.type]?.(e);},querySelectorAll(){return [];},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},click(){},});return nodes.get(id);};
 node('estimate-approval-status').value=originalStatus;
 const original={recordId:'ro-a',estimateApprovalStatus:originalStatus,estimateVersion:1,updatedAt:'2026-10-11T18:00:00Z',approvalAuditAvailable:available};
 let counter=0;
 const context={window:{trackRightCan:()=>allowed,trackRightAuthReady:Promise.resolve({shopId:'shop-a'}),trackRightSupabase:{from(){return {select(){return this;},eq(){return this;},order:async()=>({data:[],error:null})};},storage:{from(){return {upload:async(path,file)=>{uploads.push({path,file});return {error:failUpload?{message:'Upload failed'}:null};}};}}}},document:{getElementById:node,querySelectorAll:()=>[node('estimate-parts-total')],createElement:node},crypto:{randomUUID:()=>`uuid-${++counter}`},setTimeout:f=>f(),URL:{},Event:function(type){this.type=type;}};
 vm.runInNewContext(source,context);
 const controller=context.window.createEstimateApprovalAudit(original);
 await new Promise(resolve=>setImmediate(resolve));
 return {node,controller,original,uploads};
}
const f=await fixture();
f.original.estimateApprovalStatus='Approved'; // Real save mutates the RO; controller must keep its original baseline.
await assert.rejects(f.controller.prepare({estimateApprovalStatus:'Approved'}),/method/);
f.node('approval-method').value='verbal';f.node('approval-contact').value='Jon';
await assert.rejects(f.controller.prepare({estimateApprovalStatus:'Approved'}),/note/);
f.node('approval-notes').value='Authorized by phone';
let request=await f.controller.prepare({estimateApprovalStatus:'Approved'});
assert.equal(request.expected_version,1);assert.equal(request.customer_contact,'Jon');assert.equal(request.expected_updated_at,'2026-10-11T18:00:00Z');assert.equal(request.recorded_by,undefined);assert.equal(request.recorded_at,undefined);
f.node('approval-evidence').files=[{name:'sign.pdf',type:'application/pdf',size:123}];
request=await f.controller.prepare({estimateApprovalStatus:'Approved'});assert.match(request.evidence_path,/^shop-a\/ro-a\//);assert.equal(request.evidence_name,'sign.pdf');
await f.controller.prepare({estimateApprovalStatus:'Approved'});assert.equal(f.uploads.length,1);
f.node('approval-evidence').files=[{name:'bad.exe',type:'application/octet-stream',size:123}];await assert.rejects(f.controller.prepare({estimateApprovalStatus:'Approved'}),/Evidence/);
const failure=await fixture({failUpload:true});failure.node('approval-method').value='written';failure.node('approval-contact').value='Jon';failure.node('approval-evidence').files=[{name:'sign.pdf',type:'application/pdf',size:123}];await assert.rejects(failure.controller.prepare({estimateApprovalStatus:'Approved'}),error => error.message === 'Upload failed');
const unavailable=await fixture({available:false});await assert.rejects(unavailable.controller.prepare({estimateApprovalStatus:'Approved'}),/unavailable/);
const legacy=await fixture({originalStatus:'Approved'});assert.equal(await legacy.controller.prepare({estimateApprovalStatus:'Approved'}),null);
legacy.node('estimate-approval-status').value='Approved';legacy.node('estimate-parts-total').listeners.input();assert.equal(legacy.node('estimate-approval-status').value,'Draft');await assert.rejects(legacy.controller.prepare({estimateApprovalStatus:'Approved'}),/method/);
console.log('Approval UI: baseline preservation, required fields, revision invalidation, evidence types, upload failure/retry and migration gate passed.');
