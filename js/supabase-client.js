(function () {
    "use strict";

    const SUPABASE_URL = "https://amikoqrqutnpojtcyjlx.supabase.co";
    const SUPABASE_KEY = "sb_publishable_BpyMspzQY6sfM5N1eeX_dg_qWQgzC8p";

    if (!window.supabase) {
        throw new Error("Supabase failed to load.");
    }

    // Private Storage responses must never be reused across users on one browser.
    const nativeFetch = window.fetch.bind(window);
    function privateStorageFetch(input, options = {}) {
        const requestUrl = new URL(typeof input === "string" ? input : input.url || input.href);
        const method = (options.method || input.method || "GET").toUpperCase();
        const privateRead = requestUrl.origin === SUPABASE_URL &&
            requestUrl.pathname.startsWith("/storage/v1/object/") &&
            !requestUrl.pathname.startsWith("/storage/v1/object/public/") &&
            (method === "GET" || method === "HEAD");
        if (!privateRead) return nativeFetch(input, options);
        requestUrl.searchParams.set("ls_private_request", crypto.randomUUID());
        const nextInput = input instanceof Request ? new Request(requestUrl.href, input) : requestUrl.href;
        return nativeFetch(nextInput, {...options, cache: "no-store"});
    }

    window.trackRightSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            },
            global: { fetch: privateStorageFetch }
        }
    );
})();
