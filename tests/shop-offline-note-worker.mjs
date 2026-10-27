import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../pages/Shop/offline-note-sw.js',import.meta.url),'utf8'),events={};let cached=[];
const self={location:{origin:'https://test.invalid'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,cb)=>events[name]=cb};
const cache={addAll:async items=>cached.push(...items),match:async()=>new Response('offline shell')};const caches={open:async()=>cache};
vm.runInNewContext(code,{self,caches,URL,fetch:async()=>{throw Error('offline')},Response});let pending;events.install({waitUntil:p=>pending=p});await pending;assert(cached.includes('./offline-note-recovery'));assert(cached.includes('./offline-note-recovery.js?v=1'));
let answered;events.fetch({request:{url:'https://test.invalid/pages/Shop/repair-order-details?id=123',mode:'navigate',method:'GET'},respondWith:p=>answered=p});assert.equal(await (await answered).text(),'offline shell');
answered=undefined;events.fetch({request:{url:'https://api.invalid/storage/private',mode:'cors',method:'GET'},respondWith:p=>answered=p});assert.equal(answered,undefined,'never intercept external authenticated API or storage');
answered=undefined;events.fetch({request:{url:'https://test.invalid/pages/Shop/invoices',mode:'navigate',method:'GET'},respondWith:p=>answered=p});assert.equal(answered,undefined,'never cache other app pages');
console.log('Offline worker: static recovery shell only, RO navigation fallback, no private API or other page caching passed.');
