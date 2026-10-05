import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../qa/shop-security.js',import.meta.url),'utf8');
const fixtureHash='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
for(const [shop,role,allowed,cached] of [
 ['ddd8d44c-041f-4510-aa8b-a03b2dde87a6','owner',true,false],
 ['ddd8d44c-041f-4510-aa8b-a03b2dde87a6','technician',false,false],
 ['1161bc88-9ed5-4d76-a2cf-c7a77d41eea9','owner',false,false],
 ['ddd8d44c-041f-4510-aa8b-a03b2dde87a6','technician',false,true]
]){
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{disabled:true,children:[],addEventListener(event,fn){this.fn=fn},append(x){this.children.push(x)},replaceChildren(){this.children=[]}});
  return elements.get(id);
 };
 const start=Date.now();let clock=start;const timers=[],calls=[];
 class ProbeDate extends Date{static now(){return clock;}}
 const photo=()=>new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'});
 const fetchMock=async(url,options)=>{
  const signed=url==='https://test.invalid/private';
  const authorized=signed?clock<start+30000:allowed&&options.headers.Authorization==='Bearer private-test-token';
  if(!signed) {
   assert.equal(options.cache,'no-store');
   assert(new URL(url).searchParams.has('qa'));
  }
  return {ok:authorized,status:authorized?200:400,async blob(){return photo()}};
 };
 const makeClient=anon=>({
  supabaseUrl:'https://guvzuufdmnvurshknsnq.supabase.co',supabaseKey:'public-test',
  auth:{async getUser(){return {data:{user:{id:'user'}}}},async getSession(){return {data:{session:{access_token:'private-test-token'}}}}},
  from(table){
   const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},
    then(fn){
     calls.push({table,filters,anon});
     return Promise.resolve(table==='shop_members'?{data:[{shop_id:shop,role,is_active:true}]}:allowed&&!anon?{data:[{id:filters.find(x=>x[0]==='id')[1],shop_id:shop}]}:{data:[]}).then(fn);
    }};return q;
  },
  storage:{from(){return {
   async download(){return (allowed||cached)&&!anon?{data:photo()}:{error:{name:'StorageApiError',statusCode:400}}},
   async createSignedUrl(){return allowed&&!anon?{data:{signedUrl:'https://test.invalid/private'}}:{error:{statusCode:403}}}
  }}},
  async rpc(name,args){
   calls.push({rpc:name,args});assert.deepEqual(Object.keys(args.backup.cloud),[]);
   return allowed?{data:{restored:0}}:{error:{message:'Data-import permission is required'}};
  }
 });
 const createClient=(url,key,options)=>{
  if(!options.global)return makeClient(true);
  assert.equal(options.auth.persistSession,false);
  assert.equal(options.global.headers.Authorization,'Bearer private-test-token');
  return {storage:{from(){return {async download(path){
   const res=await options.global.fetch(url+'/storage/v1/object/authenticated/shop-inspection-media/'+path,{headers:options.global.headers});
   return res.ok?{data:await res.blob()}:{error:{name:'StorageApiError',statusCode:res.status}};
  }}}}};
 };
 const sandbox={window:{trackRightSupabase:makeClient(false),supabase:{createClient}},document:{getElementById:el,createElement(){return {}}},
  location:{hostname:'long-shift-test.pages.dev'},crypto:webcrypto,Uint8Array,Array,Map,Set,Date:ProbeDate,Number,String,Error,Blob,URL,
  setTimeout(fn){timers.push(fn)},encodeURIComponent,fetch:fetchMock};
 vm.createContext(sandbox);
 const code=src.replace(/"sha256": "[a-f0-9]+"/,`"sha256": "${fixtureHash}"`).replace('init().catch','globalThis.ready=init().catch');
 vm.runInContext(code,sandbox);await sandbox.ready;await el('run').fn();
 if(allowed){
  assert.equal(el('report').disabled,true);assert.equal(el('run').disabled,true);
  clock+=46000;await timers[0]();assert.equal(el('report').disabled,false);assert.equal(el('run').disabled,false);
 }
 const rows=el('results').children;
 const failed=rows.filter(x=>x.className==='fail');
 assert.equal(failed.length,cached?1:0,rows.map(x=>x.textContent).join('\n'));
 if(cached){
  assert(failed[0].textContent.includes('SDK photo download comparison'));
  assert(failed[0].textContent.includes('bytes: 3'));
  assert(failed[0].textContent.includes('fixture hash matches: true'));
 }
 assert(rows.some(x=>x.className==='pass'&&x.textContent.includes('SDK photo download without cache')));
 assert(calls.some(x=>x.anon));
 assert(calls.every(x=>!x.rpc||x.rpc==='restore_shop_data_backup'));
}
assert(src.includes('probe_version:3'));
assert(!/\.insert\(|\.update\(|\.delete\(|\.upload\(/.test(src));
console.log('PASS: owner, Tech, Shop B, anonymous, cached SDK byte detection, fresh SDK denial, expiry and no writes');
