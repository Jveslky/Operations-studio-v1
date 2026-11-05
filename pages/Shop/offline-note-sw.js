/* Cache public static recovery files only; never cache authenticated API responses. */
const CACHE = "longshift-offline-ro-shell-v11";
const FILES = [
  "./offline-note-recovery",
  "./offline-note-recovery.js?v=4",
  "./shop-offline-ro.js?v=20261105-6",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const r = event.request,
    u = new URL(r.url);
  if (u.origin !== self.location.origin || r.method !== "GET") return;
  if (
    r.mode === "navigate" &&
    /\/pages\/Shop\/repair-order-details(?:\.html)?$/.test(u.pathname)
  ) {
    event.respondWith(
      fetch(r).catch(async () => {
        const cache = await caches.open(CACHE),
          shell = await cache.match(FILES[0]);
        return shell
          ? new Response(await shell.text(), {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
              },
            })
          : new Response(
              "Offline recovery unavailable. Reconnect and reopen the RO.",
              { status: 503, headers: { "Content-Type": "text/plain" } },
            );
      }),
    );
    return;
  }
  if (FILES.some((f) => new URL(f, self.location.href).href === u.href))
    event.respondWith(
      fetch(r).catch(() => caches.open(CACHE).then((cache) => cache.match(r))),
    );
});
