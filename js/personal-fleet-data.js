(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const fleetKey = "track-right-fleet";
    const orderPattern = /^repair-order-(.+)$/;
    const pendingWrites = new Set();
    let accountId = null;
    let originalSetItem = null;
    let syncing = false;

    function parse(value, fallback) {
        try { return value ? JSON.parse(value) : fallback; }
        catch (error) { console.error("Personal Fleet data could not be read:", error); return fallback; }
    }

    function normalizeUnit(unit) {
        return {
            ...unit,
            engineSize: unit.engineSize ?? unit.engine_size ?? "",
            archived: unit.archived === true,
            includeInDashboardTotals: unit.archived === true
                ? unit.includeInDashboardTotals === true
                : true
        };
    }

    function track(promise) {
        pendingWrites.add(promise);
        promise.finally(() => pendingWrites.delete(promise));
        return promise;
    }

    function announceError(error) {
        console.error("Personal Fleet cloud save failed:", error);
        const message = error?.message || "Your change could not be saved.";
        document.dispatchEvent(new CustomEvent("trackright:data-error", {
            detail: message
        }));
        if (document.documentElement.dataset.authReady === "true") {
            window.alert(`Track Right could not save this change: ${message}`);
        }
    }

    async function upsertUnit(unit) {
        const { error } = await client.from("personal_fleet_units").upsert({
            account_id: accountId,
            record_id: String(unit.id),
            payload: unit,
            updated_at: new Date().toISOString()
        }, { onConflict: "account_id,record_id" });
        if (error) throw error;
    }

    async function syncFleet(serializedFleet) {
        const fleet = parse(serializedFleet, []).map(normalizeUnit);
        if (!Array.isArray(fleet)) return;
        const { data: existing, error: readError } = await client
            .from("personal_fleet_units").select("record_id").eq("account_id", accountId);
        if (readError) throw readError;
        const currentIds = new Set(fleet.map((unit) => String(unit.id)));
        const removed = (existing || []).filter((row) => !currentIds.has(String(row.record_id)));
        await Promise.all(fleet.map(upsertUnit));
        if (removed.length) {
            const { error } = await client.from("personal_fleet_units")
                .delete().eq("account_id", accountId).in("record_id", removed.map((row) => row.record_id));
            if (error) throw error;
        }
    }

    async function syncOrder(key, serializedOrder) {
        const order = parse(serializedOrder, null);
        if (!order) return;
        const recordId = String(order.id || key.replace("repair-order-", ""));
        const { error } = await client.from("personal_fleet_repair_orders").upsert({
            account_id: accountId,
            record_id: recordId,
            payload: order,
            updated_at: new Date().toISOString()
        }, { onConflict: "account_id,record_id" });
        if (error) throw error;
    }

    function installCloudMirror() {
        if (originalSetItem) return;
        originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            originalSetItem.call(this, key, value);
            if (this !== window.localStorage || syncing || !accountId) return;
            let promise = null;
            if (key === fleetKey) promise = syncFleet(value);
            else if (orderPattern.test(key)) promise = syncOrder(key, value);
            if (promise) track(promise.catch(announceError));
        };
    }

    function clearWorkingData() {
        syncing = true;
        localStorage.removeItem(fleetKey);
        const orderKeys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key && orderPattern.test(key)) orderKeys.push(key);
        }
        orderKeys.forEach((key) => localStorage.removeItem(key));
        syncing = false;
    }

    async function loadCloudData() {
        const [unitsResult, ordersResult] = await Promise.all([
            client.from("personal_fleet_units").select("payload").eq("account_id", accountId),
            client.from("personal_fleet_repair_orders").select("record_id,payload").eq("account_id", accountId)
        ]);
        if (unitsResult.error) throw unitsResult.error;
        if (ordersResult.error) throw ordersResult.error;

        const legacyFleet = parse(localStorage.getItem(fleetKey), []).map(normalizeUnit);
        const legacyOrders = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key && orderPattern.test(key)) {
                const order = parse(localStorage.getItem(key), null);
                if (order) legacyOrders.push(order);
            }
        }

        let units = (unitsResult.data || []).map((row) => normalizeUnit(row.payload));
        let orders = (ordersResult.data || []).map((row) => row.payload);
        const migrationKey = `track-right-personal-migrated-${accountId}`;
        if (!units.length && !orders.length && !localStorage.getItem(migrationKey) &&
            (legacyFleet.length || legacyOrders.length)) {
            await Promise.all([
                ...legacyFleet.slice(0, 20).map(upsertUnit),
                ...legacyOrders.map((order) => syncOrder(`repair-order-${order.id}`, JSON.stringify(order)))
            ]);
            units = legacyFleet.slice(0, 20);
            orders = legacyOrders;
            localStorage.setItem(migrationKey, "true");
        }

        clearWorkingData();
        syncing = true;
        localStorage.setItem(fleetKey, JSON.stringify(units));
        orders.forEach((order) => localStorage.setItem(`repair-order-${order.id}`, JSON.stringify(order)));
        syncing = false;
    }

    async function initialize() {
        const context = await window.trackRightAuthReady;
        if (!context?.personalAccountId) throw new Error("Personal Fleet account access is required.");
        accountId = context.personalAccountId;
        await loadCloudData();
        installCloudMirror();
        return context;
    }

    const readyPromise = initialize().catch((error) => {
        announceError(error);
        throw error;
    });

    window.trackRightPersonalData = {
        ready: () => readyPromise,
        flush: () => Promise.all(Array.from(pendingWrites)),
        loadPage: async function (source) {
            try {
                await readyPromise;
                const script = document.createElement("script");
                script.src = source;
                document.body.appendChild(script);
            } catch (error) {
                document.body.innerHTML = `<main class="personal-data-error"><h1>Personal Fleet could not open</h1><p>${error.message}</p></main>`;
            }
        }
    };
})();
