(function () {
    "use strict";

    const testHost = location.hostname === 'long-shift-test.pages.dev' || location.hostname.endsWith('.long-shift-test.pages.dev');
    const SUPABASE_URL = testHost ? 'https://guvzuufdmnvurshknsnq.supabase.co' : 'https://amikoqrqutnpojtcyjlx.supabase.co';
    const SUPABASE_KEY = testHost ? 'sb_publishable_cz1cnxmzVXA1U-OwIgXBkw_pazScuWr' : 'sb_publishable_BpyMspzQY6sfM5N1eeX_dg_qWQgzC8p';

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
        return nativeFetch(nextInput, {...options, cache: "no-store", redirect: "error"});
    }

    const client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                ...(testHost ? {storageKey: "long-shift-shop-test-guvzuufdmnvurshknsnq"} : {}),
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            },
            global: { fetch: privateStorageFetch }
        }
    );
    window.trackRightSupabase = client;
    let documentSession = 0;
    let documentUser = null;
    client.auth.onAuthStateChange(function (event, session) {
        const user = session?.user.id ?? null;
        if (event === "SIGNED_OUT" || user !== documentUser) documentSession++;
        documentUser = user;
    });
    window.addEventListener("pagehide", function () { documentSession++; });

    window.downloadPrivateShopDocument = async function (bucket, path) {
        const generation = documentSession;
        const { data, error } = await client.storage.from(bucket).download(path);
        if (generation !== documentSession) throw new Error("Your session changed. Try again.");
        if (error) throw error;

        const url = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url;
        link.download = path.split("/").pop() || "document";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
})();
