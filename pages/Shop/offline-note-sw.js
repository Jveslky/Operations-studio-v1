/* Test-only offline note recovery: cache only the public, static recovery shell. */
const CACHE='longshift-test-offline-note-shell-v1';
const SHELL='./offline-note-recovery.html',SCRIPT='./offline-note-recovery.js?v=1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([SHELL,SCRIPT])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(u.origin!==self.location.origin)return;
 if(r.mode==='navigate'&&/\/pages\/Shop\/repair-order-details(?:\.html)?$/.test(u.pathname)){event.respondWith(fetch(r).catch(()=>caches.open(CACHE).then(cache=>cache.match(SHELL))));return;}
 if(r.method==='GET'&&(u.pathname.endsWith('/offline-note-recovery.js')||u.pathname.endsWith('/offline-note-recovery.html'))){event.respondWith(fetch(r).catch(()=>caches.open(CACHE).then(cache=>cache.match(r))));}
});
