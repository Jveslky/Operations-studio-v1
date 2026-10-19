import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/accounts-payable.js',import.meta.url),'utf8');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',files:[],children:[],listeners:{},textContent:'',dataset:{},hidden:false,append(...n){this.children.push(...n);},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},addEventListener(e,f){this.listeners[e]=f;},scrollIntoView(){},reset(){},closest(){return null;}});return nodes.get(id);}
let resolveOcr,resolveInsert,inserts=0,removals=0;const records=[];
const client={from(){return {select(){return this;},eq(){return this;},async order(){return {data:[]};},async insert(record){inserts++;records.push(record);return new Promise(r=>resolveInsert=r);}};},storage:{from(){return {async upload(){return {data:{}};},async remove(){removals++;return {data:{}};}};}}};
const window={trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'shop',user:{id:'owner'}}),shopDocumentScanner:{prepare:async()=>({})},trackRightCan:()=>true};
vm.runInNewContext(source,{window,document:{getElementById:node,createElement:()=>node(crypto.randomUUID())},crypto,Tesseract:{recognize:()=>new Promise(r=>resolveOcr=r)},console,URL,Blob});
const settle=()=>new Promise(r=>setTimeout(r,0)),event={preventDefault(){}};await settle();
node('scan-bill-button').listeners.click();node('bill-document').files=[{type:'image/png',size:100,name:'invoice.png'}];const scan=node('bill-document').listeners.change();await settle();
await node('bill-form').listeners.submit(event);assert.equal(inserts,0);assert.match(node('bill-review-message').textContent,/Wait/);
await node('close-bill-form').listeners.click();assert.equal(removals,0,'cannot delete source while scan is running');
resolveOcr({data:{text:'Test Supplier\nInvoice # INV-22\nTotal 120.00\nOF-1 Oil filter 2 60.00 120.00'}});await scan;assert.equal(node('bill-vendor').value,'Test Supplier');assert.equal(node('bill-ocr-source').hidden,false);assert.match(node('bill-ocr-text').textContent,/OF-1/);assert.match(node('bill-review-message').textContent,/subtotal, tax not recognized/);
const first=node('bill-form').listeners.submit(event),second=node('bill-form').listeners.submit(event);await settle();assert.equal(inserts,1,'double submit cannot create two bills');assert.match(records[0].ocr_text,/OF-1/);assert.match(records[0].document_path,/shop\//);
resolveInsert({error:{message:'Rejected'}});await Promise.all([first,second]);assert.equal(node('bill-form').hidden,false);assert.match(node('bill-review-message').textContent,/Rejected/);
console.log('AP scan UI: OCR keeps source and bill save together, blocks submit/close during scan, preserves extracted text and prevents simultaneous bill inserts.');

const parse=vm.runInNewContext(source.slice(source.indexOf('    function normalizeDate'),source.indexOf('    async function pdfCanvases'))+';suggestionsFromText');
const sample='QA Test Parts Supply\nSYNTHETIC TEST INVOICE - NOT PAYABLE\nINVOICE # QA-SCAN-001\nInvoice Date: 10/18/2026\nDue Date: 11/17/2026\nQA-Filter-1 Test oil filter 2 7.50 15.00\nParts 15.00\nFreight 5.00\nSubtotal 20.00\nSales Tax 0.90\nTOTAL 20.90';
const parsed=parse(sample);assert.equal(parsed.invoice_number,'QA-SCAN-001');assert.equal(parsed.total,'20.90');assert.equal(parsed.subtotal,'20.00');assert.equal(parsed.tax,'0.90');
assert.equal(parse('TEST INVOICE - NOT PAYABLE\nInvoice Date: 10/18/2026\nSubtotal 20.00').invoice_number,'');
assert.equal(parse('Supplier\nSubtotal 20.00\nPrice 999.99').total,'','do not mistake subtotal or largest line price for total');
assert.equal(parse('Supplier\nGrand Total: $1,234.56 USD').total,'1234.56');
assert.equal(parse('Supplier\nInvoice No: ABC-123').invoice_number,'ABC-123');
console.log('AP header extraction: decorative invoice headings ignored, actual references retained, subtotal/total distinguished and unlabeled totals left for review.');

const phoneText='QA Test Parts Supply\nInvoice # QA-SCAN-002 ;\n1 Subtotal 65.00\nE Sales Tax 3.60\nN TOTAL 68.60'.replaceAll('\\n','\n');
const phone=parse(phoneText);assert.equal(phone.invoice_number,'QA-SCAN-002');assert.equal(phone.subtotal,'65.00');assert.equal(phone.tax,'3.60');assert.equal(phone.total,'68.60');
assert.equal(parse('Supplier\nParts total 60.00').total,'');
assert.equal(parse('Supplier\nSubtotal 65.00\nSales Tax 3.60').total,'');
assert.equal(parse('Supplier\nTotal 68.60\nN TOTAL 88.60').total,'');
assert.equal(parse('Supplier\nTotal 68.60\nN TOTAL 68.60').total,'68.60');
assert.equal(parse('Supplier\nTOTAL 68.60 88.60').total,'');
console.log('Phone OCR: single-character label artifacts accepted; unrelated labels, missing totals and conflicting amounts remain blank.');
