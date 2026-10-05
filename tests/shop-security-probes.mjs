import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../qa/shop-security.js',import.meta.url),'utf8');
for(const [shop,role,allowed] of [['ddd8d44c-041f-4510-aa8b-a03b2dde87a6','owner',true],['ddd8d44c-041f-4510-aa8b-a03b2dde87a6','technician',false],['1161bc88-9ed5-4d76-a2cf-c7a77d41eea9','owner',false]]){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{disabled:true,children:[],addEventListener(event,fn){this.fn=fn},append(x){this.children.push(x)},replaceChildren(){this.children=[]}});return elements.get(id)};
 let clock=Date.now();const timers=[];class ProbeDate extends Date {static now(){return clock;}}
 const calls=[];const makeClient=anon=>({supabaseUrl:'https://guvzuufdmnvurshknsnq.supabase.co',supabaseKey:'public-test',auth:{async getUser(){return {data:{user:{id:'user'}}}},async getSession(){return {data:{session:{access_token:'private-test-token'}}}}},from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},then(fn){calls.push({table,filters,anon});return Promise.resolve(table==='shop_members'?{data:[{shop_id:shop,role,is_active:true}]}:allowed&&!anon?{data:[{id:filters.find(x=>x[0]==='id')[1],shop_id:shop}]}:{data:[]}).then(fn)}};return q},storage:{from(){return {async download(){return allowed&&!anon?{data:new Blob([new Uint8Array([1,2,3])])}:{error:{statusCode:403}}},async createSignedUrl(){return allowed&&!anon?{data:{signedUrl:'https://test.invalid/private'}}:{error:{statusCode:403}}}}}},async rpc(name,args){calls.push({rpc:name,args});assert.deepEqual(Object.keys(args.backup.cloud),[]);return allowed?{data:{restored:0}}:{error:{message:'Data-import permission is required'}}}});
 const sandbox={window:{trackRightSupabase:makeClient(false),supabase:{createClient(){return makeClient(true)}}},document:{getElementById:el,createElement(){return {}}},location:{hostname:'long-shift-test.pages.dev'},crypto:webcrypto,Uint8Array,Array,Map,Set,Date:ProbeDate,Number,String,Error,Blob,URL,setTimeout(fn){timers.push(fn)},encodeURIComponent,async fetch(url,options){
  const signed=url==='https://test.invalid/private';
  const authorized=signed?clock<Date.now()+40000:allowed&&options.headers.Authorization==='Bearer private-test-token';
  return {ok:authorized,status:authorized?200:403,async blob(){return new Blob([new Uint8Array([1,2,3])])}};
 }};
 vm.createContext(sandbox);
 // Use a deterministic digest for the positive-control test fixture.
 const hash='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
 let code=src.replace(/"sha256": "[a-f0-9]+"/,`"sha256": "${hash}"`).replace('init().catch','globalThis.ready=init().catch');
 vm.runInContext(code,sandbox);await sandbox.ready;assert.equal(el('run').disabled,false);await el('run').fn();
 if(allowed){assert.equal(el('report').disabled,true);clock+=46000;await timers[0]();assert.equal(el('report').disabled,false);}
 const rows=el('results').children;assert(rows.length>=9);assert(rows.every(x=>x.className==='pass'),rows.map(x=>x.textContent).join('\n'));
 assert(calls.some(x=>x.anon));assert(calls.every(x=>!x.rpc||x.rpc==='restore_shop_data_backup'));
}
assert(src.includes('getUser()'));assert(src.includes('photo bytes received'));assert(src.includes('probe_version:2'));assert(src.includes('guvzuufdmnvurshknsnq.supabase.co'));assert(!/\.insert\(|\.update\(|\.delete\(|\.upload\(/.test(src));
console.log('PASS: owner positive controls, Tech/Test B API and storage denial, anonymous checks; no business-record writes');
