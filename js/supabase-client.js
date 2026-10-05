(function () {
 "use strict";
 const project = "guvzuufdmnvurshknsnq";
 const url = "https://guvzuufdmnvurshknsnq.supabase.co";
 const key = "sb_publishable_cz1cnxmzVXA1U-OwIgXBkw_pazScuWr";
 if (new URL(url).hostname !== project + ".supabase.co") throw new Error("Test project mismatch");
 if (!window.supabase) throw new Error("Supabase failed to load");
 // Private Storage responses must never be reused across users on one browser.
 const nativeFetch = window.fetch.bind(window);
 function privateStorageFetch(input, options = {}) {
  const requestUrl = new URL(typeof input === "string" ? input : input.url || input.href);
  const method = (options.method || input.method || "GET").toUpperCase();
  const privateRead = requestUrl.origin === url &&
   requestUrl.pathname.startsWith("/storage/v1/object/") &&
   !requestUrl.pathname.startsWith("/storage/v1/object/public/") &&
   (method === "GET" || method === "HEAD");
  if (!privateRead) return nativeFetch(input, options);
  requestUrl.searchParams.set("ls_private_request", crypto.randomUUID());
  const nextInput = input instanceof Request ? new Request(requestUrl.href, input) : requestUrl.href;
  return nativeFetch(nextInput, {...options, cache:"no-store"});
 }
 window.trackRightSupabase = window.supabase.createClient(url, key, {auth: {
  persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
  storageKey: "long-shift-shop-test-" + project
 }, global: { fetch: privateStorageFetch }});
 document.documentElement.dataset.environment = "test";
 function label() {
  const banner = document.createElement("div");
  banner.textContent = "LONG SHIFT TEST • Synthetic data only";
  banner.style.cssText = "background:#f26522;color:#111;text-align:center;padding:6px;font:700 13px sans-serif";
  document.body.prepend(banner);
 }
 if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", label);
 else label();
})();
