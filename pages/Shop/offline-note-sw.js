/* Test-only offline note recovery: cache only the public, static recovery shell. */
const CACHE='longshift-test-offline-note-shell-v3';
const SHELL='./offline-note-recovery',SCRIPT='./offline-note-recovery.js?v=2';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([SHELL,SCRIPT])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(u.origin!==self.location.origin)return;
 if(r.mode==='navigate'&&/\/pages\/Shop\/repair-order-details(?:\.html)?$/.test(u.pathname)){
  event.respondWith(fetch(r).catch(async()=>{const cache=await caches.open(CACHE),shell=await cache.match(SHELL);if(!shell)return new Response('Offline note recovery is unavailable. Reconnect and open the repair order again.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});return new Response(await shell.text(),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}));return;
 }
 if(r.method==='GET'&&(u.pathname.endsWith('/offline-note-recovery.js')||u.pathname.endsWith('/offline-note-recovery'))){event.respondWith(fetch(r).catch(()=>caches.open(CACHE).then(cache=>cache.match(r))));}
});
