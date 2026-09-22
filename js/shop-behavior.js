(function () {
    "use strict";
    const defaults = Object.freeze({
        scheduling_lead_hours: 0,
        default_appointment_duration_minutes: 60,
        default_appointment_type: "Shop",
        default_ro_priority: "Medium",
        default_invoice_terms_days: 30,
        auto_add_approved_time_off: true,
        request_reminder_lead_hours: 24
    });
    window.trackRightShopBehaviorDefaults = defaults;
    window.trackRightShopBehavior = window.trackRightAuthReady.then(async function (context) {
        if (!context?.shopId) return { ...defaults };
        const result = await window.trackRightSupabase.from("shop_behavior_settings").select("*").eq("shop_id",context.shopId).maybeSingle();
        if (result.error) { console.warn("Shop behavior defaults could not load; built-in defaults are being used.",result.error); return { ...defaults }; }
        return { ...defaults, ...(result.data || {}) };
    });
})();
