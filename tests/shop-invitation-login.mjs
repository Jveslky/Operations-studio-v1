import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/login.js',import.meta.url),'utf8');
async function route(returnTo,{existing=true,shop=false,platform=false,base='/',user=true}={}) {
 const listeners={},redirects=[],queries=[];
 const button={disabled:false};
 const form={querySelector:()=>button,addEventListener:(event,fn)=>{listeners[event]=fn;}};
 const nodes={'login-form':form,'auth-message':{}};
 const client={auth:{getSession:async()=>({data:{session:existing?{}:null}}),getUser:async()=>({data:{user:user?{id:'qa-user',user_metadata:{}}:null}}),signInWithPassword:async()=>({error:null})},from(table){queries.push(table);return{select(){return this;},eq(){return this;},limit(){return this;},maybeSingle:async()=>({data:table==='shop_members'&&shop?{shop_id:'a'}:table==='platform_users'&&platform?{role:'platform_owner'}:null})};}};
 const context={window:{trackRightSupabase:client,location:{origin:'https://test.example',href:`https://test.example${base}login`,search:'?returnTo='+encodeURIComponent(returnTo),replace:value=>redirects.push(value)}},document:{getElementById:id=>nodes[id]},localStorage:{getItem:()=>null},URL,URLSearchParams,Promise,console,FormData:class{get(){return 'synthetic';}}};
 vm.runInNewContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 if(!existing){await listeners.submit({preventDefault(){}});}
 return {redirect:redirects.at(-1),queries};
}
for(const existing of [true,false]) {
 for(const path of ['/shop-beta-invite.html?token=qa-token','/shop-beta-invite?token=qa-token','/shop-beta-invite/?token=qa-token','/accept-invite.html?token=staff-token','/accept-invite?token=staff-token']) {
  const result=await route(path,{existing});assert.equal(result.redirect,path);assert.equal(result.queries.length,0);
 }
 assert.equal((await route('/pages/Shop/shop-dashboard.html',{existing})).redirect,'account-required.html');
 assert.equal((await route('/pages/Shop/shop-dashboard.html',{existing,shop:true})).redirect,'/pages/Shop/shop-dashboard.html');
 assert.equal((await route('/pages/Admin/users.html',{existing,shop:true})).redirect,'/pages/Admin/users.html');
 assert.equal((await route('/pages/Admin/development-dashboard.html',{existing,shop:true})).redirect,'pages/Shop/shop-dashboard.html');
}
const nested='/Operations-studio-v1/shop-beta-invite.html?token=qa-token';
assert.equal((await route(nested,{base:'/Operations-studio-v1/'})).redirect,nested);
for(const path of ['//evil.example/shop-beta-invite?token=x','/\\evil.example/shop-beta-invite?token=x','/shop-beta-invite.html','/other/shop-beta-invite.html?token=x','https://evil.example/']) {
 assert.equal((await route(path)).redirect,'account-required.html');
}
assert.equal((await route('/shop-beta-invite?token=x',{user:false})).redirect,'login.html');
console.log('Shop invitation login: new and existing sessions retain token/deployment path before membership; workspace gates and external redirect denial passed.');
