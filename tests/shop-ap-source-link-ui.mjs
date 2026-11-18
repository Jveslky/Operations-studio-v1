import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/accounts-payable.js',import.meta.url),'utf8');
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bills=[{id,vendor:'Supplier A',invoice_number:'INV-22',total:25,status:'paid'},{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',vendor:'Supplier B',invoice_number:'INV-23',total:50,status:'open'}];
function boot(parameter){
 const nodes=new Map();let sequence=0;
 function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',files:[],children:[],listeners:{},textContent:'',dataset:{},hidden:false,append(...n){this.children.push(...n);},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},get childElementCount(){return this.children.length;},addEventListener(e,f){this.listeners[e]=f;},before(){},scrollIntoView(){},reset(){},closest(){return null;}});return nodes.get(id);}
 const client={from(){return {select(){return this;},eq(key,value){assert.equal(key,'shop_id');assert.equal(value,'shop-a');return this;},async order(){return {data:bills};}};}};
 const window={location:{search:'?bill='+parameter},trackRightSupabase:client,trackRightAuthReady:Promise.resolve({shopId:'shop-a',user:{id:'reader'}}),trackRightCan:()=>false};
 vm.runInNewContext(source,{window,document:{getElementById:node,createElement:()=>node('generated-'+sequence++)},URLSearchParams,console});return {node};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
let app=boot(id);await settle();assert.equal(app.node('bill-list').children.length,1);assert.equal(app.node('bill-list').children[0].dataset.billId,id);assert.equal(app.node('ap-source-context').hidden,false);assert.match(app.node('ap-source-label').textContent,/INV-22/);assert.equal(app.node('total-payable').textContent,'$50.00','overview metrics keep their full-shop meaning');
app.node('ap-source-clear').listeners.click();assert.equal(app.node('bill-list').children.length,2);assert.equal(app.node('ap-source-context').hidden,true);
app=boot(id);await settle();app.node('bill-search').value='Supplier B';app.node('bill-search').listeners.input();assert.equal(app.node('bill-list').children.length,1);assert.equal(app.node('bill-list').children[0].dataset.billId,bills[1].id);
app=boot('cccccccc-cccc-cccc-cccc-cccccccccccc');await settle();assert.match(app.node('ap-source-label').textContent,/unavailable in this shop/);assert.equal(app.node('bill-list').children[0].textContent,'No vendor bills match your filters.');
app=boot('invalid');await settle();assert.equal(app.node('ap-source-context').hidden,true);assert.equal(app.node('bill-list').children.length,2);
console.log('AP source link: exact bill selection, full-shop metrics, show-all/search escape, unavailable source and invalid parameter handling passed.');
