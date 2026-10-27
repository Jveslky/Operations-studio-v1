import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../pages/Shop/accounts-payable.js',import.meta.url),'utf8');
const existing={id:'old',vendor:'Test Vendor',invoice_number:'INV-1',invoice_date:'2026-10-25',total:10,status:'paid'};
let bills=[existing],calls=[],confirmAnswer=false,serverRace=false;const saved=new Map();
const nodes=new Map();let seq=0;function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',files:[],children:[],listeners:{},dataset:{},hidden:false,textContent:'',append(...x){this.children.push(...x)},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]},before(x){this.beforeNode=x},addEventListener(n,f){this.listeners[n]=f},scrollIntoView(){},reset(){},closest(){return null}});return nodes.get(id)}
const client={from(){return {select(){return this},eq(){return this},async order(){return {data:bills}}}},storage:{from(){return {async remove(){return {}}}}},async rpc(name,args){calls.push(structuredClone(args));return serverRace?{error:{message:'AP_DUPLICATE_REVIEW_REQUIRED'}}:{data:{id:'new'}}}};
const window={location:{hostname:'example.invalid',search:''},trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'shop',user:{id:'writer'},role:'service_writer'}),trackRightCan:()=>true,confirm:()=>confirmAnswer};
const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
vm.runInNewContext(src,{window,localStorage,document:{getElementById:node,createElement:()=>node(`generated-${++seq}`)},crypto:{randomUUID:()=>`request-${++seq}`},console,URL,Blob});await new Promise(r=>setImmediate(r));
node('add-bill-button').listeners.click();node('bill-vendor').value=' Test Vendor ';node('bill-reference').value='inv-1';node('bill-amount').value='10';node('bill-invoice-date').value='2026-10-25';
await node('bill-form').listeners.submit({preventDefault(){}});assert.equal(calls.length,0,'cancel override must not save');assert.equal(node('bill-duplicate-warning').hidden,false);
confirmAnswer=true;await node('bill-form').listeners.submit({preventDefault(){}});assert.deepEqual(calls[0].p_record.duplicate_override_ids,['old']);assert.equal(saved.size,0);
node('add-bill-button').listeners.click();node('bill-vendor').value='Different Vendor';node('bill-reference').value='new';node('bill-amount').value='10';serverRace=true;
await node('bill-form').listeners.submit({preventDefault(){}});assert.equal(saved.size,0,'deterministic duplicate rejection clears pending request');assert.match(node('bill-review-message').textContent,/matching bill appeared/);assert.equal(node('bill-form').hidden,false);
console.log('AP duplicate UI: cancel, explicit override and server race rejection passed.');
