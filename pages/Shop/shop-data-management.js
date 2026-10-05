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
        appointments: { table: "shop_appointments", date: "created_at" },
        response_sets: { table: "shop_inspection_response_sets", date: "id" },
        response_options: { table: "shop_inspection_response_options", date: "id" },
        inspection_templates: { table: "shop_inspection_templates", date: "id" },
        template_sections: { table: "shop_inspection_template_sections", date: "id" },
        template_items: { table: "shop_inspection_template_items", date: "id" },
        inspections: { table: "shop_inspections", date: "id" },
        inspection_items: { table: "shop_inspection_items", date: "id" },
        ro_media: { table: "shop_ro_media", date: "id" }
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


    const mediaBucket = "shop-inspection-media";
    const maxMediaBytes = 250 * 1024 * 1024;
    const mediaTypes = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm"]);
    function validMediaPath(row) {
        const prefix = `${context.shopId}/${String(row.repair_order_id).replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
        return typeof row.object_path === "string" && row.object_path.startsWith(prefix) &&
            !row.object_path.slice(prefix.length).includes("/") && row.object_path.length > prefix.length;
    }
    async function digest(bytes) {
        return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
            .map(value => value.toString(16).padStart(2, "0")).join("");
    }
    function encode(bytes) {
        let value = "";
        for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return btoa(value);
    }
    function decode(value) {
        if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid media encoding");
        return Uint8Array.from(atob(value), char => char.charCodeAt(0));
    }
    async function recoveryFiles(rows) {
        const files = [];
        let total = 0;
        for (const row of rows) {
            if (!validMediaPath(row) || !mediaTypes.has(row.mime_type)) throw new Error("Invalid media record");
            total += Number(row.file_size);
            if (total > maxMediaBytes) throw new Error("Media exceeds the 250 MB recovery limit; no backup was downloaded");
            status("data-export-message", `Backing up media ${files.length + 1} of ${rows.length}…`, "");
            const result = await client.storage.from(mediaBucket).download(row.object_path);
            if (result.error) throw result.error;
            const bytes = new Uint8Array(await result.data.arrayBuffer());
            if (bytes.length !== Number(row.file_size)) throw new Error("Media size differs from its record");
            files.push({ object_path: row.object_path, sha256: await digest(bytes), data: encode(bytes) });
        }
        return files;
    }
    async function validateRecoveryFiles(data) {
        if (data.version === 2) return;
        if (!Array.isArray(data.media_files)) throw new Error("Recovery media files are missing");
        const rows = data.cloud.ro_media || [];
        const files = new Map();
        let total = 0;
        for (const file of data.media_files) {
            if (files.has(file.object_path)) throw new Error("Duplicate recovery media path");
            files.set(file.object_path, file);
        }
        if (files.size !== rows.length) throw new Error("Media file/record counts differ");
        for (const row of rows) {
            if (!validMediaPath(row) || !mediaTypes.has(row.mime_type) || !(Number(row.file_size) > 0) || Number(row.file_size) > 100 * 1024 * 1024) throw new Error("Invalid recovery media record");
            total += Number(row.file_size);
            if (total > maxMediaBytes) throw new Error("Recovery media exceeds 250 MB");
            const file = files.get(row.object_path);
            if (!file) throw new Error("Recovery file is missing for a media record");
            if (typeof file.data !== "string" || file.data.length > Math.ceil(Number(row.file_size) / 3) * 4) throw new Error("Media encoding exceeds declared size");
            const bytes = decode(file.data);
            if (bytes.length !== Number(row.file_size) || await digest(bytes) !== file.sha256) throw new Error("Media integrity check failed");
            // Bound the DOM preview and avoid inserting uploaded strings as HTML.
        }
    }
    async function restoreRecoveryFiles(data) {
        if (data.version === 2) return;
        const files = new Map(data.media_files.map(file => [file.object_path, file]));
        for (const row of data.cloud.ro_media || []) {
            const file = files.get(row.object_path);
            const storage = client.storage.from(mediaBucket);
            const existing = await storage.download(row.object_path);
            if (!existing.error) {
                if (await digest(await existing.data.arrayBuffer()) !== file.sha256) throw new Error("An existing media file differs; it was preserved");
                continue;
            }
            const code = Number(existing.error.statusCode || existing.error.status);
            if (code !== 404 && code !== 400) throw existing.error;
            const upload = await storage.upload(row.object_path, decode(file.data), { contentType: row.mime_type, upsert: false });
            if (upload.error) {
                // Concurrent or repeat restores preserve files and verify their contents.
                const retry = await storage.download(row.object_path);
                if (retry.error || await digest(await retry.data.arrayBuffer()) !== file.sha256) throw upload.error;
            }
        }
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
                version: 3,
                source_shop_id: context.shopId,
                exported_at: new Date().toISOString(),
                excludes: ["private team documents", "shop settings", "notifications"],
                media_files: await recoveryFiles(cloud.ro_media),
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
            if (file.size > 350 * 1024 * 1024) throw new Error("Recovery file exceeds the 350 MB browser limit.");
            const data = JSON.parse(await file.text());
            if (data.format !== "track-right-shop-backup" || ![2, 3].includes(data.version) || !data.cloud) {
                throw new Error("This is not a supported Long Shift Shop backup.");
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
            await validateRecoveryFiles(data);
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
            const result = await client.rpc("restore_shop_data_backup", { backup: { ...validated, media_files: undefined } });
            if (result.error) throw result.error;
            await restoreRecoveryFiles(validated);
            Object.entries(validated.legacy || {}).forEach(([key, value]) => {
                if ((key.startsWith("repair-order-") || legacyKeys.includes(key)) &&
                    localStorage.getItem(key) === null) {
                    localStorage.setItem(key, JSON.stringify(value));
                }
            });
            status("data-import-message", "Import complete. Existing records were preserved.", "success");
        } catch (error) {
            status("data-import-message", `Import incomplete: ${error.message}. Records or files may already have been restored; retry this same backup to finish.`, "error");
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
