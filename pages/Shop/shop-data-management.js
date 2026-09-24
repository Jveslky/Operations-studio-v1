(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const configs = {
        customers: { table: "Customers", date: "created_at" },
        units: { table: "customer_units", date: "created_at" },
        repair_orders: { table: "shop_repair_orders", date: "created_at" },
        invoices: { table: "shop_invoices", date: "created_at" },
        accounts_payable: { table: "shop_accounts_payable", date: "created_at" },
        requests: { table: "shop_requests", date: "created_at" },
        calendar: { table: "shop_calendar_events", date: "created_at" },
        appointments: { table: "shop_appointments", date: "created_at" }
    };
    const legacyKeys = ["track-right-invoices", "track-right-customers", "track-right-accounts-payable"];
    const $ = (id) => document.getElementById(id);
    let context = null;
    let validated = null;

    function status(id, message, state) {
        const element = $(id);
        element.textContent = message;
        element.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function download(name, type, content) {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function range() {
        const choice = $("data-export-range").value;
        const now = new Date();
        let start = null;
        let end = null;
        if (choice === "year") start = new Date(now.getFullYear(), 0, 1);
        if (choice === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (choice === "30") {
            start = new Date(now);
            start.setDate(start.getDate() - 30);
        }
        if (choice === "custom") {
            start = $("data-export-start").value ? new Date(`${$("data-export-start").value}T00:00:00`) : null;
            end = $("data-export-end").value ? new Date(`${$("data-export-end").value}T23:59:59`) : null;
        }
        return { start, end };
    }

    async function fetchSet(key, filterByRange) {
        const config = configs[key];
        const dates = filterByRange ? range() : {};
        const pageSize = 500;
        const records = [];
        for (let offset = 0; ; offset += pageSize) {
            let query = client.from(config.table).select("*")
                .eq("shop_id", context.shopId)
                .order(config.date, { ascending: true })
                .order("id", { ascending: true })
                .range(offset, offset + pageSize - 1);
            if (dates.start) query = query.gte(config.date, dates.start.toISOString());
            if (dates.end) query = query.lte(config.date, dates.end.toISOString());
            const result = await query;
            if (result.error) throw result.error;
            records.push(...(result.data || []));
            if (!result.data || result.data.length < pageSize) break;
        }
        return records;
    }

    function csv(records) {
        if (!records.length) return "No records\n";
        const keys = Array.from(new Set(records.flatMap(Object.keys)));
        const cell = (value) => `"${String(value == null ? "" :
            typeof value === "object" ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
        return [keys.map(cell).join(","), ...records.map((record) =>
            keys.map((key) => cell(record[key])).join(","))].join("\r\n");
    }

    function belongsToCurrentShop(value) {
        if (!value || typeof value !== "object") return false;
        const sourceShopId = value.shop_id || value.shopId || value.sourceShopId;
        return String(sourceShopId || "") === String(context.shopId);
    }

    function collectLegacy() {
        const records = {};
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || !(key.startsWith("repair-order-") || legacyKeys.includes(key))) continue;
            try {
                const value = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(value)) {
                    const scoped = value.filter(belongsToCurrentShop);
                    if (scoped.length) records[key] = scoped;
                } else if (belongsToCurrentShop(value)) {
                    records[key] = value;
                }
            } catch (error) {
                console.warn("Skipped invalid legacy record", key, error);
            }
        }
        return records;
    }

    $("data-export-range").addEventListener("change", function () {
        document.querySelectorAll(".data-custom-range").forEach((element) => {
            element.hidden = this.value !== "custom";
        });
    });

    $("export-data-csv").addEventListener("click", async function () {
        try {
            this.disabled = true;
            const key = $("data-export-type").value;
            status("data-export-message", "Preparing CSV…", "");
            const records = await fetchSet(key, true);
            download(`track-right-${key}-${new Date().toISOString().slice(0, 10)}.csv`,
                "text/csv;charset=utf-8", `\ufeff${csv(records)}`);
            status("data-export-message", `${records.length} records exported.`, "success");
        } catch (error) {
            status("data-export-message", `Export failed: ${error.message}`, "error");
        } finally {
            this.disabled = false;
        }
    });

    $("export-full-backup").addEventListener("click", async function () {
        try {
            this.disabled = true;
            status("data-export-message", "Building shop data backup…", "");
            const cloud = {};
            for (const key of Object.keys(configs)) cloud[key] = await fetchSet(key, false);
            const backup = {
                format: "track-right-shop-backup",
                version: 2,
                source_shop_id: context.shopId,
                exported_at: new Date().toISOString(),
                excludes: ["private storage documents", "photos", "videos"],
                cloud,
                legacy: collectLegacy()
            };
            download(`track-right-shop-backup-${new Date().toISOString().slice(0, 10)}.json`,
                "application/json", JSON.stringify(backup, null, 2));
            status("data-export-message", "Shop data backup downloaded.", "success");
        } catch (error) {
            status("data-export-message", `Backup failed: ${error.message}`, "error");
        } finally {
            this.disabled = false;
        }
    });

    $("shop-backup-file").addEventListener("change", async function () {
        validated = null;
        $("shop-backup-review").hidden = true;
        $("shop-backup-confirm-label").hidden = true;
        $("shop-backup-confirm").checked = false;
        $("import-shop-backup").disabled = true;
        const file = this.files[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (data.format !== "track-right-shop-backup" || data.version !== 2 || !data.cloud) {
                throw new Error("This is not a supported version 2 Track Right Shop backup.");
            }
            if (data.source_shop_id !== context.shopId) {
                throw new Error("This backup belongs to a different shop and cannot be imported here.");
            }
            for (const [key, records] of Object.entries(data.cloud)) {
                if (!configs[key] || !Array.isArray(records)) throw new Error(`Invalid backup dataset: ${key}`);
                if (records.some((record) => record.shop_id !== context.shopId)) {
                    throw new Error(`Tenant validation failed in ${key}.`);
                }
            }
            for (const [key, value] of Object.entries(data.legacy || {})) {
                if (!(key.startsWith("repair-order-") || legacyKeys.includes(key))) {
                    throw new Error(`Invalid legacy backup key: ${key}`);
                }
                const entries = Array.isArray(value) ? value : [value];
                if (!entries.every(belongsToCurrentShop)) {
                    throw new Error("Legacy browser records lack matching shop ownership and cannot be imported.");
                }
            }
            validated = data;
            const review = $("shop-backup-review");
            review.innerHTML = `<h3>Backup validated</h3><ul>${Object.entries(data.cloud)
                .map(([key, records]) => `<li>${key.replaceAll("_", " ")}: ${records.length}</li>`)
                .join("")}<li>Legacy browser records: ${Object.keys(data.legacy || {}).length}</li></ul>`;
            review.hidden = false;
            $("shop-backup-confirm-label").hidden = false;
            status("data-import-message", "Review the counts and confirm before importing.", "success");
        } catch (error) {
            status("data-import-message", error.message, "error");
        }
    });

    $("shop-backup-confirm").addEventListener("change", function () {
        $("import-shop-backup").disabled = !this.checked || !validated;
    });

    $("import-shop-backup").addEventListener("click", async function () {
        if (!validated || !$("shop-backup-confirm").checked) return;
        try {
            this.disabled = true;
            status("data-import-message", "Importing missing records…", "");
            const result = await client.rpc("restore_shop_data_backup", { backup: validated });
            if (result.error) throw result.error;
            Object.entries(validated.legacy || {}).forEach(([key, value]) => {
                if ((key.startsWith("repair-order-") || legacyKeys.includes(key)) &&
                    localStorage.getItem(key) === null) {
                    localStorage.setItem(key, JSON.stringify(value));
                }
            });
            status("data-import-message", "Import complete. Existing records were preserved.", "success");
        } catch (error) {
            status("data-import-message", `Import stopped: ${error.message}`, "error");
        } finally {
            this.disabled = false;
        }
    });

    window.trackRightAuthReady.then(function (authContext) {
        context = authContext;
        $("export-data-csv").disabled = false;
        $("export-full-backup").disabled = false;
        const canImport = window.trackRightCan("data.import");
        $("shop-backup-file").disabled = !canImport;
        const canExport = window.trackRightCan("data.export");
        $("export-data-csv").disabled = !canExport;
        $("export-full-backup").disabled = !canExport;
        if (!canImport) status("data-import-message",
            "Owner or admin access is required to import backups.", "error");
    }).catch((error) => status("data-export-message",
        `Data Management could not load: ${error.message}`, "error"));
}());
