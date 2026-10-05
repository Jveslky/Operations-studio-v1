import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const calls=[];let config;
const base='https://guvzuufdmnvurshknsnq.supabase.co';
const sandbox={URL,Request,crypto:webcrypto,window:{
 fetch:async(input,options)=>{calls.push({input,options});return {status:200}},
 supabase:{createClient(url,key,options){assert.equal(url,base);config=options;return {}}}
},document:{documentElement:{dataset:{}},readyState:'loading',addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(new URL('../js/supabase-client.js',import.meta.url),'utf8'),sandbox);
const fetch=config.global.fetch;
const path=base+'/storage/v1/object/authenticated/shop-inspection-media/shop/ro/photo.jpg';
await fetch(path,{headers:{Authorization:'Bearer owner-test'}});
await fetch(path,{headers:{Authorization:'Bearer tech-test'}});
assert.equal(calls[0].options.cache,'no-store');
assert.equal(calls[1].options.cache,'no-store');
assert.notEqual(calls[0].input,calls[1].input);
assert.equal(calls[1].options.headers.Authorization,'Bearer tech-test');
const req=new Request(path,{headers:{Authorization:'Bearer other-test'},method:'HEAD'});
await fetch(req);
assert(calls[2].input instanceof Request);
assert.equal(calls[2].input.headers.get('Authorization'),'Bearer other-test');
assert.equal(calls[2].input.method,'HEAD');
assert.equal(calls[2].options.cache,'no-store');
const unchanged=[
 [base+'/rest/v1/shop_members',{}],
 [base+'/storage/v1/object/public/public-bucket/photo.jpg',{}],
 [path,{method:'POST',body:'unchanged'}],
 ['https://other.invalid/storage/v1/object/authenticated/bucket/photo.jpg',{}]
];
for(const [input,options] of unchanged){
 await fetch(input,options);
 assert.equal(calls.at(-1).input,input);
 assert.equal(calls.at(-1).options,options);
}
assert.equal(config.auth.storageKey,'long-shift-shop-test-guvzuufdmnvurshknsnq');
console.log('PASS: unique uncached private GET/HEAD; current credentials preserved; other requests unchanged');
