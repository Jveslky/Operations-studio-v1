(function () {
 "use strict";
 const project = "guvzuufdmnvurshknsnq";
 const url = "https://guvzuufdmnvurshknsnq.supabase.co";
 const key = "sb_publishable_cz1cnxmzVXA1U-OwIgXBkw_pazScuWr";
 if (new URL(url).hostname !== project + ".supabase.co") throw new Error("Test project mismatch");
 if (!window.supabase) throw new Error("Supabase failed to load");
 window.trackRightSupabase = window.supabase.createClient(url, key, {auth: {
  persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
  storageKey: "long-shift-shop-test-" + project
 }});
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
