(function () {
    "use strict";

    const SUPABASE_URL = "https://amikoqrqutnpojtcyjlx.supabase.co";
    const SUPABASE_KEY = "sb_publishable_BpyMspzQY6sfM5N1eeX_dg_qWQgzC8p";

    if (!window.supabase) {
        throw new Error("Supabase failed to load.");
    }

    window.trackRightSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );
})();
