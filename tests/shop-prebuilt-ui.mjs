import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
function node(tag='div'){return {tag,showModal(){this.open=true},close(){this.open=false;this.events.close?.()},remove(){},cloneNode(){return node(this.tag)},focus(){},removeEventListener(e){delete this.events[e]},scrollIntoView(){},children:[],value:'',checked:false,events:{},append(...a){this.children.push(...a)},before(n){this.previous=n},replaceChildren(){this.children=[]},setAttribute(){},addEventListener(e,f){this.events[e]=f},dispatchEvent(){},closest(){return {parentElement:this}}};}
const root=node(),fields=Object.fromEntries(['parts','hours','rate','other','otherTaxable','otherLabel','notes'].map(k=>[k,node('input')]));fields.parts.value='20';fields.hours.value='1';fields.rate.value='150';fields.other.value='0';
let changes=0,q={definition:{name:'5 qt',mode:'flat'},packagePrice:89.95,parts:63.95,labor:35,total:98.95,rate:150,expectedHours:.75,laborHours:0,lines:[{item_id:'part',quantity:1,part_number:'FILTER',description:'Filter',stock_unit:'each',charge:9}]};
const order={recordId:'ro',prebuiltAllocationsAvailable:true,estimateStockLines:[{item_id:'part',quantity:1,unit_price:15,part_number:'FILTER',description:'Filter',stock_unit:'each'}],estimatePrebuiltJobs:[]};
const template={id:'template',version:2,definition:{name:'5 qt',mode:'flat',lines:[]}},writes=[];
const client={from(){return {select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[template]}),single:async()=>({data:template})}},rpc:async(name)=>{writes.push(name);return {data:{rows:[]}}}};
const window={dispatchEvent(){},trackRightSupabase:client,trackRightCan:()=>true,trackRightAuthReady:Promise.resolve({shopId:'a',user:{id:'writer'},role:'service_writer'}),shopPrebuiltEditor:{edit(){throw Error('RO must use read-only preview')}}};
vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/shop-prebuilt-pricing.js',import.meta.url),'utf8'),{window,structuredClone});
window.shopPrebuiltPricing.quote=()=>q;
const context={window,CustomEvent:function(type){this.type=type},document:{body:node(),createElement:node,getElementById:()=>root},structuredClone,Event:function(type){this.type=type},crypto};
vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/shop-ro-inventory.js',import.meta.url),'utf8'),context);
const editor=await window.shopROInventory.mount({order,totalInput:fields.parts,changed:()=>{changes++}});
vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/shop-prebuilt-apply.js',import.meta.url),'utf8'),context);
await window.shopPrebuiltApply.mount({order,stockEditor:editor,fields,changed:()=>changes++});
const button=root.previous.children.find(n=>n.className==='ro-prebuilt-controls').children[0];
async function pickJob(confirm=true){
 await button.onclick();
 const dialog=context.document.body.children.at(-1);
 dialog.children[4].value='template';
 const actions=dialog.children.at(-2);
 await actions.children[confirm?1:0].onclick();
}
await pickJob();
assert.equal(fields.parts.value,'83.95');assert.equal(fields.other.value,'0','package is not an Other charge');assert.equal(order.estimatePrebuiltLaborTotal,35);assert.equal(order.estimatePrebuiltPartsTotal,63.95);assert.equal(fields.hours.value,'1','flat package does not fabricate billed hours');assert.equal(editor.lines()[0].quantity,2,'included stock still reserves actual quantity');assert.equal(editor.lines()[0].unit_price,7.5,'existing stock charge preserved without a second part charge');assert.equal(order.estimatePrebuiltJobs[0].template_version,2);assert.match(fields.notes.value,/prebuilt labor \$35.00/);assert.deepEqual(writes,[],'adding a prebuilt does not post stock or financial transactions');
const before=JSON.stringify(order);await pickJob(false);assert.equal(JSON.stringify(order),before,'cancelling review does not add a job');assert.ok(changes>0);
console.log('Prebuilt UI: copied review, flat-price application, duplicate-stock merge, no fabricated labor hours, cancel and no immediate transactions passed.');

fields.rate.value='175';const unchanged=JSON.stringify(order);await window.shopPrebuiltApply.openCurrent();const pickerDialog=context.document.body.children.at(-1);assert.equal(pickerDialog.open,true);assert.match(pickerDialog.children[2].textContent,/175.00/);assert.equal(JSON.stringify(order),unchanged,'opening toolbar picker never changes the estimate');assert.equal(pickerDialog.children[4].children.length,1,'picker contains active catalog results');const dialogCount=context.document.body.children.length;await window.shopPrebuiltApply.openCurrent();assert.equal(context.document.body.children.length,dialogCount,'repeated taps do not open multiple pickers');pickerDialog.children.at(-2).children[0].onclick();assert.equal(JSON.stringify(order),unchanged,'cancel leaves the estimate intact');console.log('Toolbar picker uses current rate, loads active jobs, prevents duplicate dialogs and cancels without changes');

assert.equal(root.previous.children.find(n=>n.className==='ro-prebuilt-jobs').children[0].children[0].textContent,'5 qt');
await button.onclick();
const searchDialog=context.document.body.children.at(-1);
const search=searchDialog.children[3];
search.value='unmatched';
search.events.input();
assert.equal(searchDialog.children.at(-2).children[1].disabled,true);
search.value='5 qt';
search.events.input();
assert.equal(searchDialog.children.at(-2).children[1].disabled,false);
searchDialog.children[1].children[1].onclick();
assert.equal(searchDialog.children.at(-2).children[1].disabled,false);
assert.equal(searchDialog.children.at(-1).href,'prebuilt-jobs.html?mode=mixed');
searchDialog.children[1].children[0].onclick();
assert.equal(searchDialog.children.at(-2).children[1].disabled,false);
searchDialog.close();
await button.onclick();
const mixedDialog=context.document.body.children.at(-1);
mixedDialog.children[1].children[1].onclick();
const extras=mixedDialog.children[5];
assert.equal(extras.hidden,false);
mixedDialog.children[4].value='template';
extras.children[1].children[0].value='FUEL';
extras.children[2].children[0].value='2';
extras.children[3].children[0].value='0.5';
extras.children[4].children[0].value='Shop-supplied seal';
extras.children[5].children[0].value='12.50';
client.rpc=async()=>({data:{rows:[{id:'fuel',part_number:'FUEL',description:'Fuel filter',stock_unit:'each',sale_price:25}]}});
await mixedDialog.children.at(-2).children[1].onclick();
assert.equal(fields.parts.value,'210.40');
assert.equal(fields.hours.value,'1.5');
assert.equal(editor.lines().find(line=>line.item_id==='fuel').quantity,2);
assert.match(fields.notes.value,/Add-on labor: 0.5 h/);
assert.equal(order.estimatePrebuiltJobs.at(-1).quote.total,98.95);

assert.match(fields.notes.value,/Non-stock part: Shop-supplied seal.*12\.50/);
assert.equal(editor.lines().length,2);
