(function () {
    "use strict";
    const storageKey = "track-right-personal-technicians";

    async function load() {
        const context = await window.trackRightAuthReady;
        const { data, error } = await window.trackRightSupabase
            .from("personal_fleet_technicians")
            .select("id,name,email,phone,is_active,created_at,updated_at")
            .eq("account_id", context.personalAccountId)
            .order("name");
        if (error) throw error;
        const technicians = data || [];
        localStorage.setItem(storageKey, JSON.stringify(technicians));
        return technicians;
    }

    function get(includeInactive = false) {
        let technicians = [];
        try { technicians = JSON.parse(localStorage.getItem(storageKey)) || []; }
        catch { technicians = []; }
        return includeInactive ? technicians : technicians.filter((item) => item.is_active !== false);
    }

    window.trackRightTechnicians = { load, get, storageKey };
    window.trackRightTechniciansReady = load().catch((error) => {
        console.error("Could not load Personal Fleet technicians:", error);
        return get(true);
    });
})();
