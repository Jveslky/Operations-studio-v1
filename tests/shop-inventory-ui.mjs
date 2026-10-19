import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/inventory.js',import.meta.url),'utf8');
const storage=new Map(),calls=[],requests=new Map();let stock=5,dropResponse=true,failRead=false,denyReceive=false,blockRead=false,storageFailure=false;const reads=[];
const item={id:'item-a',part_number:'<Part>',manufacturer:'<Maker>',description:'<img onerror=bad>',stock_unit:'each',location:'A-1',sale_price:10,reorder_point:2,last_unit_cost:4,updated_at:'2026-10-16T00:00:00Z'};
function boot(user='owner-a'){
 const nodes=new Map();let seq=0;
 function node(id){if(!nodes.has(id))nodes.set(id,{id,type:id==='item-archived'?'checkbox':'text',value:id==='inventory-filter'?'active':'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',children:[],listeners:{},classList:{toggle(){}},replaceChildren(){this.children=[];this.innerHTML='';},append(n){this.children.push(n);},addEventListener(e,f){this.listeners[e]=f;},focus(){},reset(){},querySelector(selector){return node(this.id+selector);}});return nodes.get(id);}
 const window={trackRightAuthReady:Promise.resolve({shopId:'shop-a',role:'owner',user:{id:user}}),confirm:()=>true,addEventListener(){},trackRightSupabase:{async rpc(name,args){
  calls.push({name,args:JSON.parse(JSON.stringify(args))});
  if(name==='shop_inventory_directory'){
   if(blockRead)return new Promise(resolve=>reads.push(resolve));
   return failRead?{error:{message:'Read failed'}}:{data:{count:1,rows:[{...item,on_hand:stock}],can_receive:true,can_manage:true}};
  }
  if(name==='shop_inventory_history')return {data:{count:1,rows:[{quantity:1,kind:'receipt',reason:'<bad>',supplier:'<supplier>',invoice_reference:'<invoice>',delivery_reference:'D',unit_cost:4,recorded_by_email:'<staff>',recorded_at:'2026-10-16T00:00:00Z'}]}};
  if(denyReceive)return {error:{message:'Denied by database',code:'42501'}};
  const previous=requests.get(args.p_request);if(previous){assert.equal(previous,JSON.stringify(args));return {data:{}};}
  requests.set(args.p_request,JSON.stringify(args));if(name==='receive_shop_inventory')stock+=Number(args.p_lines[0].quantity);
  return dropResponse?{error:{message:'Fetch failed'}}:{data:{}};
 }}};
 vm.runInNewContext(source,{window,document:{getElementById:node,createElement:()=>node('generated-'+seq++)},localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(storageFailure)throw Error('Storage disabled');storage.set(k,v);},removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>crypto.randomUUID()},setTimeout,clearTimeout,console});
 return {node,window,nodes};
}
const settle=()=>new Promise(r=>setTimeout(r,0));
const action=(app,label)=>{const card=app.node('inventory-rows').children[0],actions=card.querySelector('.inventory-actions');return actions.children.find(n=>n.textContent===label);};
const submit=async(app,id)=>app.node(id).listeners.submit({preventDefault(){}});
function fillReceipt(app){action(app,'Add to receipt').listeners.click();app.node('receipt-supplier').value='QA Supplier';app.node('receipt-invoice').value='I-1';app.node('receipt-delivery').value='D-1';const row=app.node('receipt-lines').children[0];const input=row.children[0].children[0];input.value='2';input.listeners.input();}
let app=boot();await settle();assert.equal(calls[0].args.p_shop,'shop-a');assert.equal(calls[0].args.p_size,25);
const html=app.node('inventory-rows').children[0].innerHTML;assert.match(html,/&lt;Part&gt;/);assert.doesNotMatch(html,/<img/);
action(app,'History').listeners.click();await settle();assert.match(app.node('inventory-history-rows').innerHTML,/&lt;staff&gt;/);assert.doesNotMatch(app.node('inventory-history-rows').innerHTML,/<supplier>/);assert.match(app.node('inventory-history-rows').innerHTML,/Invoice &lt;invoice&gt;/);assert.match(app.node('inventory-history-rows').innerHTML,/Delivery D/);assert.match(app.node('inventory-history-rows').innerHTML,/\$4\.00/);
fillReceipt(app);const before=calls.length;await submit(app,'inventory-receipt-form');assert.equal(stock,7);assert.equal(app.node('inventory-pending').hidden,false);assert.match(app.node('inventory-message').textContent,/not confirmed/);
const write=calls.slice(before).find(c=>c.name==='receive_shop_inventory');assert.equal(write.args.p_shop,'shop-a');assert.equal(write.args.p_lines[0].quantity,2);assert.equal(storage.size,1);
await submit(app,'inventory-receipt-form');assert.equal(calls.filter(c=>c.name==='receive_shop_inventory').length,1,'pending request prevents new writes');
app=boot();await settle();assert.equal(app.node('inventory-pending').hidden,false,'reload restores ambiguous save');
await app.node('inventory-retry').listeners.click();await settle();assert.equal(stock,7);const retry=calls.filter(c=>c.name==='receive_shop_inventory').at(-1);assert.deepEqual(retry.args,write.args);assert.equal(storage.size,0);assert.equal(app.node('inventory-pending').hidden,true);
dropResponse=false;denyReceive=true;fillReceipt(app);await submit(app,'inventory-receipt-form');assert.equal(storage.size,0,'definitive database rejection clears pending key');assert.equal(app.node('inventory-receipt').hidden,false,'failed receipt retains form');assert.match(app.node('inventory-message').textContent,/Denied/);denyReceive=false;
storageFailure=true;const countBefore=calls.filter(c=>c.name==='receive_shop_inventory').length;await submit(app,'inventory-receipt-form');assert.equal(calls.filter(c=>c.name==='receive_shop_inventory').length,countBefore,'never send without durable retry request');assert.match(app.node('inventory-message').textContent,/No save was sent/);storageFailure=false;
failRead=true;app.node('inventory-refresh').listeners.click();await settle();assert.equal(app.node('inventory-rows').children.length,0);assert.equal(app.node('inventory-item-save').disabled,true);assert.match(app.node('inventory-message').textContent,/Read failed/);failRead=false;
blockRead=true;app.node('inventory-refresh').listeners.click();await settle();app.node('inventory-filter').value='archived';app.node('inventory-filter').listeners.change();await settle();assert.equal(reads.length,2);
reads[1]({data:{count:0,rows:[],can_manage:true,can_receive:true}});await settle();reads[0]({data:{count:1,rows:[{...item,on_hand:99}],can_manage:true,can_receive:true}});await settle();assert.equal(app.node('inventory-rows').children.length,0,'stale reply cannot restore old stock');blockRead=false;
// A pending save is tied to both shop and user, and cannot cross into a different login.
storage.set('long-shift-inventory-pending:shop-a:owner-a',JSON.stringify({rpc:'receive_shop_inventory',args:write.args,summary:'Receipt'}));
const otherApp=boot('other-user');await settle();assert.equal(otherApp.node('inventory-pending').hidden,true);assert.equal(storage.size,1);
// Two tabs' persisted requests survive independent acknowledgments.
const secondArgs={...write.args,p_request:'second-request'};requests.set(secondArgs.p_request,JSON.stringify(secondArgs));
storage.set('long-shift-inventory-pending:shop-a:owner-a:second-request',JSON.stringify({rpc:'receive_shop_inventory',args:secondArgs,summary:'Second saved request'}));
app=boot();await settle();assert.equal(storage.size,2);await app.node('inventory-retry').listeners.click();await settle();assert.equal(storage.size,1);assert.equal(app.node('inventory-pending').hidden,false);await app.node('inventory-retry').listeners.click();await settle();assert.equal(storage.size,0);assert.equal(stock,7);
console.log('Inventory UI: bounded/scoped reads, escaped data/history, stale-response denial, lost-response reload/retry identity, failed-form retention, user-scoped recovery and storage-failure write blocking passed.');
