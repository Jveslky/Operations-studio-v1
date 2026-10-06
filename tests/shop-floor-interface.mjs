import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const auth=fs.readFileSync(new URL('js/auth.js',root),'utf8');
const start=auth.indexOf('    function shopPageName(');
const end=auth.indexOf('    function addShopSettingsMenu(',start);
function route(role,page,permissions=[]){
 const brand={href:'../../index.html'};
 const links=['shop-dashboard','repair-orders','customers','invoices','accounts-payable'].map(name=>({href:`https://test.invalid/pages/Shop/${name}.html`,textContent:name,remove(){this.removed=true;}}));
 const window={location:{pathname:`/pages/Shop/${page}`,href:`https://test.invalid/pages/Shop/${page}`,replace(href){this.redirect=href;}},trackRightCan:p=>permissions.includes(p)};
 const document={querySelectorAll:s=>s.startsWith('.app-brand')?[brand]:links.filter(l=>!l.removed)};
 const sandbox={window,document,URL,loginPath:'../../login.html'};vm.createContext(sandbox);
 vm.runInContext(auth.slice(start,end)+'\nresult=applyShopPageAccess({role:'+JSON.stringify(role)+'});',sandbox);
 return {window,brand,links,result:sandbox.result};
}
for(const role of ['technician','foreman']){
 for(const path of ['technician-dashboard','technician-dashboard.html','technician-dashboard/','repair-orders','repair-order-details.html']){
  const r=route(role,path);assert.equal(r.result,true,`${role} allowed ${path}`);assert.equal(r.window.location.redirect,undefined);
  assert.equal(r.brand.href,'../../pages/Shop/technician-dashboard.html');
  assert.deepEqual(r.links.filter(l=>!l.removed).map(l=>l.textContent),['Dashboard','repair-orders']);
 }
 for(const path of ['shop-dashboard','customers.html','invoices','shop-settings','accounts-payable.html']){
  const r=route(role,path);assert.equal(r.result,false,`${role} forbidden ${path}`);assert.equal(r.window.location.redirect,'../../pages/Shop/technician-dashboard.html');
 }
}
assert.equal(route('service_writer','shop-dashboard').result,true);
assert.equal(route('admin','shop-settings',['settings.manage']).result,true);
// Data-layer tests verify the request actually uses the limited RPC and carries no estimate/customer fields.
const source=fs.readFileSync(new URL('pages/Shop/shop-repair-orders-data.js',root),'utf8');
for(const role of ['technician','foreman']){
 const calls=[];
 const fake={rpc:async(name,args)=>{calls.push({name,args});return{data:{id:'record',ro_number:1001}};},from(){throw new Error('Floor role attempted direct table mutation');}};
 const window={trackRightSupabase:fake,trackRightAuthReady:Promise.resolve({role,shopId:'shop',user:{id:'user'}})};
 vm.runInNewContext(source,{window,console});
 await window.trackRightRepairOrders.update({recordId:'record',technician:'tech@example.com',additionalTechnician:'',priority:'High',status:'In Progress',laborHours:3,technicianNotes:'work',estimateTotal:9999,customer:'forged'});
 assert.equal(calls.length,1);assert.equal(calls[0].name,role==='technician'?'update_shop_repair_order_work':'update_shop_repair_order_floor');
 assert.equal(Object.keys(calls[0].args).some(k=>/estimate|customer/.test(k)),false);
 if(role==='technician') assert.equal(Object.keys(calls[0].args).some(k=>/priority|additional_technician|^new_technician$/.test(k)),false);
}
const dashboard=fs.readFileSync(new URL('pages/Shop/technician-dashboard.js',root),'utf8');
const from=dashboard.indexOf('    function renderSchedule('),to=dashboard.indexOf('    function renderRequests(',from);
const count={textContent:''},scheduleList={items:[],replaceChildren(){this.items=[];},append(value){this.items.push(value);}};
const today=new Date().toISOString().slice(0,10);
vm.runInNewContext(dashboard.slice(from,to)+'\nrenderSchedule(appointments);',{
 context:{role:'foreman',user:{email:'foreman@example.com'}},scheduleList,
 document:{getElementById:()=>count},dateOnly:v=>String(v).slice(0,10),formatDate:v=>v,row:(...args)=>args,empty(){},
 appointments:Array.from({length:15},()=>({technician:'tech@example.com',status:'Scheduled',scheduled_on:today,start_time:'08:00'}))
});
assert.equal(count.textContent,15);assert.equal(scheduleList.items.length,10);
console.log('PASS: extensionless/HTML routes, floor navigation, narrow save requests, and full schedule count');
