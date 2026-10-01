import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../pages/Shop/repair-order-intake.js',import.meta.url),'utf8');
async function fixture(allowed=true, fail=false){
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,textContent:'',options:[],listeners:{},classList:{toggle(){}},add(o){this.options.push(o);},get selectedOptions(){return this.options.filter(o=>o.value===this.value);},focus(){},checkValidity(){return true;},querySelectorAll(){return [];},querySelector(){return node('submit');},addEventListener(e,f){this.listeners[e]=f;}});return nodes.get(id);}
 const calls=[];
 const customer=node('new-customer'), unit=node('new-unit');
 customer.options=[{value:'',textContent:'Choose'}];
 const form=node('form');form.hidden=false;
 const context={document:{getElementById:node,querySelectorAll(){return[];}},window:{trackRightAuthReady:Promise.resolve({shopId:'test-a'}),trackRightCan:()=>allowed},supabaseClient:{from: table => ({insert: payload => {
 calls.push({table,payload});
 return {select: () => ({single: async () => fail ? {error:{message:'denied'}} : {data:{id:table==='Customers'?'customer-a':'unit-a',name:payload.name}}})};
}})},getRepairOrderShopId:async()=> 'test-a',newCustomerInput:customer,newUnitInput:unit,newRepairOrderForm:form,cancelNewRepairOrderButton:node('cancel'),newRoDataMessage:node('message'),unitLoadRequestId:0,selectedCustomerId:null,setUnitDropdownState(){unit.options=[];unit.disabled=true;},Option:function(text,value){this.textContent=text;this.value=value;}};
 vm.runInNewContext(source,context);await Promise.resolve();
 return {node,calls,context,customer,unit};
}
const f=await fixture();
f.node('draft-complaint').value='Keep my work';
f.node('quick-customer-name').value='Test customer';
await f.node('quick-customer-save').listeners.click();
assert.equal(f.customer.value,'customer-a');assert.equal(f.context.selectedCustomerId,'customer-a');
assert.equal(f.calls[0].payload.shop_id,'test-a');assert.equal(f.node('draft-complaint').value,'Keep my work');
f.node('quick-unit-open').listeners.click();f.node('quick-unit-name').value='Loader 3';
await f.node('quick-unit-save').listeners.click();
assert.equal(f.unit.value,'unit-a');assert.equal(f.calls[1].payload.customer_id,'customer-a');assert.equal(f.calls[1].payload.shop_id,'test-a');
const denied=await fixture(false);denied.node('quick-customer-name').value='No';await denied.node('quick-customer-save').listeners.click();assert.equal(denied.calls.length,0);assert.equal(denied.node('intake-shortcuts').hidden,true);
const failed=await fixture(true,true);failed.node('quick-customer-name').value='Retry';await failed.node('quick-customer-save').listeners.click();assert.equal(failed.node('quick-customer-name').value,'Retry');assert.equal(failed.node('submit').disabled,false);assert.match(failed.node('quick-intake-message').textContent,/Could not confirm/);
const empty=await fixture();empty.node('quick-unit-open').listeners.click();assert.match(empty.node('quick-intake-message').textContent,/customer first/);assert.equal(empty.calls.length,0);
console.log('Inline intake: scoped saves, selection, role denial, failed-save draft, and customer prerequisite passed.');
