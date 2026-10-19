import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const parser=fs.readFileSync(new URL('../pages/Shop/ap-parts-review.js',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../pages/Shop/ap-receiving.js',import.meta.url),'utf8');
const nodes=new Map(),storage=new Map(),calls=[];let sequence=0,drop=true,deny=false,storageFail=false,historyFail=false;
function node(tag){const n={tag,id:'n'+sequence++,children:[],listeners:{},value:'',checked:false,hidden:false,disabled:false,isConnected:true,open:false,textContent:'',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(e,f){this.listeners[e]=f;},querySelector(s){return [...nodes.values()].find(n=>n.id===s.slice(1));},showModal(){this.open=true;},close(){this.open=false;}};
Object.defineProperty(n,'innerHTML',{set(html){for(const m of html.matchAll(/<(\w+)[^>]*id="([^"]+)"[^>]*>/g)){const child=node(m[1]);child.id=m[2];nodes.set(m[2],child);this.children.push(child);}}});nodes.set(n.id,n);return n;}
const body=node('body'),window={trackRightAuthReady:Promise.resolve({shopId:'shop',user:{id:'owner'}}),trackRightCan:()=>true,confirm:()=>true,addEventListener(){},trackRightSupabase:{from(){return {select(){return this;},eq(){return this;},async order(){return historyFail?{error:{message:'Unavailable'}}:{data:[]};}};},async rpc(name,args){calls.push({name,args:JSON.parse(JSON.stringify(args))});if(name==='shop_inventory_directory')return {data:{rows:[{id:'part',part_number:'OF-1',description:'<unsafe>',stock_unit:'each'}]}};return deny?{error:{code:'42501',message:'Denied'}}:drop?{error:{message:'Network lost'}}:{data:{receipt_id:'receipt-1'}};}}};
const sandbox={window,document:{body,createElement:node},structuredClone,localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(storageFail)throw Error('Storage blocked');storage.set(k,v);},removeItem:k=>storage.delete(k)},crypto};
vm.runInNewContext(parser,sandbox);vm.runInNewContext(ui,sandbox);
const parts=window.shopAPParts;
assert.equal(parts.suggest('OF-1 Oil filter 2 10.00 20.00\nTOTAL 20.00\nX-2 Bad math 2 10.00 50.00').length,1);
assert.equal(parts.suggest('Invoice INV-2026\nFreight 12.00\nCORE -10.00').length,0);
assert.equal(parts.stockLine({item_id:'p',received:'2',pack:'6',supplier_cost:'60'}).quantity,12);
assert.equal(parts.stockLine({item_id:'p',received:'2',pack:'6',supplier_cost:'60'}).unit_cost,10);
assert.throws(()=>parts.stockLine({item_id:'p',received:'0.001',pack:'0.001',supplier_cost:'1'}));
const bill={id:'bill',vendor:'Supplier',invoice_number:'I-1',updated_at:'2026-10-19T00:00:00Z',ocr_text:'OF-1 Oil filter 2 60.00 120.00'};
const settle=()=>new Promise(r=>setTimeout(r,0)),by=id=>[...nodes.values()].find(n=>n.id===id),click=async n=>{await n.listeners.click();await settle();};
const action=text=>[...nodes.values()].find(n=>n.tag==='button'&&n.textContent===text);
async function fill(){
 await window.shopAPReceiving.open(bill);let card=by('ap-stock-rows').children[0];let select=card.children.find(n=>n.tag==='label'&&n.textContent==='Decision').children[0];select.value='receive';select.listeners.change();
 card=by('ap-stock-rows').children[0];await click(card.children.find(n=>n.textContent==='Search inventory'));
 const matches=card.children.find(n=>n.tag==='div');await click(matches.children[0]);card=by('ap-stock-rows').children[0];
 for(const [label,value] of [['Supplier units actually delivered','1'],['Stock units in one supplier unit (1 for each)','6']]){const input=card.children.find(n=>n.textContent===label).children[0];input.value=value;input.listeners.input();}
 by('ap-stock-delivery').value='D-1';by('ap-stock-source-check').checked=true;by('ap-stock-physical').checked=true;
}
await fill();await click(by('ap-stock-save'));assert.equal(calls.filter(c=>c.name==='receive_shop_ap_stock').length,1);assert.equal(storage.size,1);assert.match(by('ap-stock-message').textContent,/uncertain/);const original=calls.at(-1).args;
await click(by('ap-stock-save'));assert.equal(calls.filter(c=>c.name==='receive_shop_ap_stock').length,1);
await window.shopAPReceiving.open(bill);assert.equal(by('ap-stock-save').disabled,true);drop=false;await click(by('ap-stock-retry'));assert.deepEqual(calls.at(-1).args,original);assert.equal(storage.size,0);assert.match(by('ap-stock-message').textContent,/increased once/);
await fill();storageFail=true;const before=calls.length;await click(by('ap-stock-save'));assert.equal(calls.length,before);assert.match(by('ap-stock-message').textContent,/Storage blocked/);storageFail=false;
deny=true;await click(by('ap-stock-save'));assert.equal(storage.size,0);assert.match(by('ap-stock-message').textContent,/No receipt saved/);
historyFail=true;await window.shopAPReceiving.open(bill);assert.equal(by('ap-stock-save').disabled,true);
console.log('AP receiving UI: conservative extraction, explicit delivered/pack review, exact pending retry, storage-failure blocking, definitive rejection and history-read failure gate passed.');
