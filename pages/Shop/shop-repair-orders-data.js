(function () {
    "use strict";

    const client = window.trackRightSupabase;
    let contextPromise = null;

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function context() {
        if (!contextPromise) {
            contextPromise = Promise.resolve(window.trackRightAuthReady)
                .then(function (authContext) {
                    if (!authContext?.shopId || !authContext?.user?.id) {
                        throw new Error("Your shop session is unavailable. Sign in again and retry.");
                    }

                    return authContext;
                });
        }

        return contextPromise;
    }

    function toModel(row) {
        return {
            id: String(row.ro_number),
            recordId: row.id,
            legacyLocalId: row.legacy_local_id,
            technicianUserId: row.technician_user_id || null,
            additionalTechnicianUserId: row.additional_technician_user_id || null,
            customerId: row.customer_id || "",
            billingSnapshot: row.billing_snapshot || {},
            unitId: row.unit_id || "",
            customer: row.customer_name || "",
            unit: row.unit_name || "",
            status: row.status || "Open",
            priority: row.priority || "Normal",
            technician: row.technician || "Unassigned",
            additionalTechnician: row.additional_technician || "",
            complaint: row.complaint || "",
            partsNeeded: row.parts_needed || "",
            customerNotes: row.customer_notes || "",
            technicianNotes: row.technician_notes || "",
            additionalWorkPerformed: row.additional_work_performed || "",
            laborHours: number(row.labor_hours),
            estimateLaborHours: number(row.estimate_labor_hours),
            estimateLaborRate: number(row.estimate_labor_rate),
            estimateStockLines: row.estimate_stock_lines,
            stockLinesOriginal: row.estimate_stock_lines,
            estimatePartsTotal: number(row.estimate_parts_total),
            estimateOtherCharges: number(row.estimate_other_charges),
            estimateShopSupplies: number(row.estimate_shop_supplies),
            estimateShopSuppliesTaxable: row.estimate_shop_supplies_taxable === true,
            estimateEnvironmentalFee: number(row.estimate_environmental_fee),
            estimateEnvironmentalFeeTaxable: row.estimate_environmental_fee_taxable === true,
            estimateMiscFeeLabel: row.estimate_misc_fee_label || "",
            estimateMiscFeeTaxable: row.estimate_misc_fee_taxable === true,
            estimateDiscount: number(row.estimate_discount),
            estimateTotal: number(row.estimate_total),
            estimateApprovalStatus: row.estimate_approval_status || "Draft",
            estimateNotes: row.estimate_notes || "",
            estimateVersion: row.estimate_version || 1,
            approvalAuditAvailable: row.estimate_version !== undefined,
            archived: row.archived === true,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            appMode: "shop"
        };
    }

    function toRow(order, authContext, includeIdentity) {
        const row = {
            customer_id: order.customerId ? String(order.customerId) : null,
            unit_id: order.unitId ? String(order.unitId) : null,
            customer_name: order.customer || "",
            unit_name: order.unit || "",
            status: order.status || "Open",
            priority: order.priority || "Normal",
            technician: order.technician || "Unassigned",
            additional_technician: order.additionalTechnician || "",
            complaint: order.complaint || "",
            parts_needed: order.partsNeeded || "",
            customer_notes: order.customerNotes || "",
            technician_notes: order.technicianNotes || "",
            additional_work_performed: order.additionalWorkPerformed || "",
            labor_hours: number(order.laborHours),
            estimate_labor_hours: number(order.estimateLaborHours),
            estimate_labor_rate: number(order.estimateLaborRate),
            estimate_parts_total: number(order.estimatePartsTotal),
            estimate_other_charges: number(order.estimateOtherCharges),
            estimate_shop_supplies: number(order.estimateShopSupplies),
            estimate_shop_supplies_taxable: order.estimateShopSuppliesTaxable === true,
            estimate_environmental_fee: number(order.estimateEnvironmentalFee),
            estimate_environmental_fee_taxable: order.estimateEnvironmentalFeeTaxable === true,
            estimate_misc_fee_label: order.estimateMiscFeeLabel || "",
            estimate_misc_fee_taxable: order.estimateMiscFeeTaxable === true,
            estimate_discount: number(order.estimateDiscount),
            estimate_total: number(order.estimateTotal),
            estimate_approval_status: order.estimateApprovalStatus || "Draft",
            estimate_notes: order.estimateNotes || "",
            archived: order.archived === true
        };

        if (order.estimateStockLines !== undefined) { row.estimate_stock_lines = order.estimateStockLines; row.stock_lines_expected = order.stockLinesOriginal ?? []; }

        if (order.approvalRequest) row.approval_request = order.approvalRequest;

        if (includeIdentity) {
            row.shop_id = authContext.shopId;
            row.created_by = authContext.user.id;
        }

        return row;
    }

    async function list() {
        const authContext = await context();
        const { data, error } = await client
            .from("shop_repair_orders")
            .select("*")
            .eq("shop_id", authContext.shopId)
            .order("ro_number", { ascending: false });

        if (error) throw error;
        return (data || []).map(toModel);
    }

    async function get(identifier) {
        const orders = await list();
        return orders.find(function (order) {
            return order.recordId === identifier ||
                order.id === String(identifier) ||
                order.legacyLocalId === String(identifier);
        }) || null;
    }

    async function create(order) {
        const authContext = await context();
        const row = toRow(order, authContext, true);
        // Capture the saved default once, without overwriting an explicit rate
        // (including zero) or changing existing estimates when settings change.
        if (order.estimateLaborRate == null || order.estimateLaborRate === "") {
            const profile = await client.from("shops")
                .select("default_labor_rate")
                .eq("id", authContext.shopId)
                .single();
            if (profile.error) throw profile.error;
            if (!profile.data) throw new Error("Could not load the shop labor rate. Retry creating the repair order.");
            row.estimate_labor_rate = number(profile.data.default_labor_rate);
        }
        const { data, error } = await client
            .from("shop_repair_orders")
            .insert(row)
            .select("*")
            .single();

        if (error) throw error;
        return toModel(data);
    }

    async function update(order) {
        const authContext = await context();

        if (order.status === "Ready for Payment" && order.estimateStockLines !== undefined) {
            const current = await get(order.id);
            if (current.status !== "Ready for Payment") {
                if (JSON.stringify(current.estimateStockLines) !== JSON.stringify(order.estimateStockLines)) throw Error("Save stocked lines before marking Ready for Payment.");
                const manifest = await client.rpc("get_shop_supplement_stock", {p_ro:order.recordId});
                if (manifest.error) throw manifest.error;
                const supplements = manifest.data || [];
                const summary = [ ...current.estimateStockLines.map(x => `Original estimate — ${x.part_number}: ${x.quantity} ${x.stock_unit}`),
                    ...supplements.flatMap(s => s.lines.map(x => `Supplement ${s.number} · Rev. ${s.revision} — ${x.part_number}: ${x.quantity} ${x.stock_unit}`)) ].join("\n");
                if (summary) {
                    if (!window.confirm("Ready for Payment: consume these held parts?\n" + summary + "\nPreviously consumed parts will not be deducted again.")) throw Error("Stock consumption canceled. No changes saved.");
                    const confirmed = await client.rpc("confirm_shop_all_ro_stock", {p_ro:order.recordId,p_baseline:current.estimateStockLines,p_supplements:supplements});
                    if (confirmed.error) throw confirmed.error;
                }
            }
        }
        if (authContext.role === "technician") {
            const { data, error } = await client.rpc("update_shop_repair_order_work", {
                target_id: order.recordId,
                new_status: order.status,
                new_technician_notes: order.technicianNotes || "",
                new_labor_hours: number(order.laborHours),
                new_additional_work: order.additionalWorkPerformed || ""
            });

            if (error) throw error;
            return toModel(data);
        }

        const { data, error } = await client
            .from("shop_repair_orders")
            .update(toRow(order, authContext, false))
            .eq("id", order.recordId)
            .eq("shop_id", authContext.shopId)
            .select("*")
            .single();

        if (error) throw error;
        return toModel(data);
    }

    async function migrateBrowserOrders() {
        const authContext = await context();
        const candidates = [];
        const completedKey = `track-right-ro-migrated:${authContext.shopId}`;
        const dismissedKey = `track-right-ro-migration-dismissed:${authContext.shopId}`;

        if (localStorage.getItem(completedKey) || sessionStorage.getItem(dismissedKey)) {
            return { migrated: 0, skipped: 0 };
        }

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || !/^repair-order-\d+$/.test(key)) continue;

            try {
                const order = JSON.parse(localStorage.getItem(key));
                if (!order?.id) continue;
                // Browser storage is shared by every shop on this origin. Only records
                // explicitly tagged for this shop can be imported automatically.
                const sourceShopId = order.shop_id || order.shopId || order.sourceShopId;
                if (String(sourceShopId || "") !== String(authContext.shopId)) continue;

                const row = toRow(order, authContext, true);
                row.legacy_local_id = String(order.id);
                row.ro_number = number(order.id) || null;
                candidates.push(row);
            } catch (error) {
                console.warn("Skipped an unreadable browser repair order:", key, error);
            }
        }

        if (!candidates.length) {
            localStorage.setItem(completedKey, new Date().toISOString());
            return { migrated: 0, skipped: 0 };
        }

        const shopName = authContext.shop?.name || "this shop";
        const shouldMigrate = window.confirm(
            `${candidates.length} browser-only repair order${candidates.length === 1 ? "" : "s"} ` +
            `were found. Import them into ${shopName}?\n\n` +
            "Choose Cancel if these records belong to another shop."
        );

        if (!shouldMigrate) {
            sessionStorage.setItem(dismissedKey, "true");
            return { migrated: 0, skipped: candidates.length };
        }

        const { data, error } = await client
            .from("shop_repair_orders")
            .upsert(candidates, {
                onConflict: "shop_id,legacy_local_id",
                ignoreDuplicates: true
            })
            .select("id");

        if (error) throw error;
        localStorage.setItem(completedKey, new Date().toISOString());
        return { migrated: (data || []).length, skipped: candidates.length - (data || []).length };
    }

    window.trackRightRepairOrders = {
        list,
        get,
        create,
        update,
        migrateBrowserOrders,
        approvalSnapshot(order) {
            const row = toRow(order, {}, false);
            return Object.fromEntries(Object.entries(row).filter(([key]) =>
                (key.startsWith('estimate_') && key !== 'estimate_approval_status') ||
                ['complaint','parts_needed','customer_id','unit_id','customer_name','unit_name'].includes(key)).map(([key,value]) => [key, typeof value === 'number' ? Number(value.toFixed(2)) : value]));
        }
    };
}());
