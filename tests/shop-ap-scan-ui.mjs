import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/accounts-payable.js',import.meta.url),'utf8');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',files:[],children:[],listeners:{},textContent:'',dataset:{},hidden:false,append(...n){this.children.push(...n);},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},addEventListener(e,f){this.listeners[e]=f;},scrollIntoView(){},reset(){},closest(){return null;}});return nodes.get(id);}
let resolveOcr,resolveInsert,inserts=0,removals=0;const records=[];
const client={from(){return {select(){return this;},eq(){return this;},async order(){return {data:[]};},async insert(record){inserts++;records.push(record);return new Promise(r=>resolveInsert=r);}};},storage:{from(){return {async upload(){return {data:{}};},async remove(){removals++;return {data:{}};}};}}};
const window={trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'shop',user:{id:'owner'}}),trackRightCan:()=>true};
vm.runInNewContext(source,{window,document:{getElementById:node,createElement:()=>node(crypto.randomUUID())},crypto,Tesseract:{recognize:()=>new Promise(r=>resolveOcr=r)},console,URL,Blob});
const settle=()=>new Promise(r=>setTimeout(r,0)),event={preventDefault(){}};await settle();
node('scan-bill-button').listeners.click();node('bill-document').files=[{type:'image/png',size:100,name:'invoice.png'}];const scan=node('bill-document').listeners.change();await settle();
await node('bill-form').listeners.submit(event);assert.equal(inserts,0);assert.match(node('bill-review-message').textContent,/Wait/);
await node('close-bill-form').listeners.click();assert.equal(removals,0,'cannot delete source while scan is running');
resolveOcr({data:{text:'Test Supplier\nInvoice # INV-22\nTotal 120.00\nOF-1 Oil filter 2 60.00 120.00'}});await scan;assert.equal(node('bill-vendor').value,'Test Supplier');
const first=node('bill-form').listeners.submit(event),second=node('bill-form').listeners.submit(event);await settle();assert.equal(inserts,1,'double submit cannot create two bills');assert.match(records[0].ocr_text,/OF-1/);assert.match(records[0].document_path,/shop\//);
resolveInsert({error:{message:'Rejected'}});await Promise.all([first,second]);assert.equal(node('bill-form').hidden,false);assert.match(node('bill-review-message').textContent,/Rejected/);
console.log('AP scan UI: OCR keeps source and bill save together, blocks submit/close during scan, preserves extracted text and prevents simultaneous bill inserts.');
