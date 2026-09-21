(function () {
    "use strict";
    const form = document.getElementById("fleet-settings-form");
    const nameInput = document.getElementById("fleet-name");
    const message = document.getElementById("settings-message");
    const regionalFields = {
        region: document.getElementById("fleet-region"), locale: document.getElementById("fleet-locale"),
        currency: document.getElementById("fleet-currency"), distance: document.getElementById("fleet-distance"),
        volume: document.getElementById("fleet-volume"), temperature: document.getElementById("fleet-temperature"),
        pressure: document.getElementById("fleet-pressure")
    };
    const technicianForm = document.getElementById("technician-form");
    const technicianId = document.getElementById("technician-id");
    const technicianName = document.getElementById("technician-name");
    const technicianEmail = document.getElementById("technician-email");
    const technicianPhone = document.getElementById("technician-phone");
    const technicianList = document.getElementById("technician-list");
    const technicianMessage = document.getElementById("technician-message");
    let context = null;
    let technicians = [];

    Promise.all([window.trackRightAuthReady, window.trackRightTechniciansReady]).then((results) => {
        context = results[0];
        technicians = results[1];
        nameInput.value = context.personalAccount?.name ||
            context.user.user_metadata?.full_name || context.user.email || "";
        const settings = window.trackRightFleetRegion.get();
        regionalFields.region.value = settings.region_code;
        regionalFields.locale.value = settings.locale_code;
        regionalFields.currency.value = settings.currency_code;
        regionalFields.distance.value = settings.distance_unit;
        regionalFields.volume.value = settings.volume_unit;
        regionalFields.temperature.value = settings.temperature_unit;
        regionalFields.pressure.value = settings.pressure_unit;
        renderTechnicians();
    });

    regionalFields.region.addEventListener("change", () => {
        if (regionalFields.region.value === "US") {
            Object.assign(regionalFields.locale, { value: "en-US" }); regionalFields.currency.value = "USD";
            regionalFields.distance.value = "mi"; regionalFields.volume.value = "gal";
            regionalFields.temperature.value = "F"; regionalFields.pressure.value = "psi";
        } else if (regionalFields.region.value === "IE") {
            regionalFields.locale.value = "en-IE"; regionalFields.currency.value = "EUR";
            regionalFields.distance.value = "km"; regionalFields.volume.value = "L";
            regionalFields.temperature.value = "C"; regionalFields.pressure.value = "bar";
        }
    });
    Object.values(regionalFields).slice(1).forEach((field) => field.addEventListener("change", () => {
        regionalFields.region.value = "CUSTOM";
    }));

    function renderTechnicians() {
        technicianList.replaceChildren();
        technicians.forEach((technician) => {
            const row = document.createElement("article");
            row.className = `technician-row${technician.is_active === false ? " inactive" : ""}`;
            const identity = document.createElement("div");
            const name = document.createElement("strong");
            name.textContent = technician.name;
            const contact = document.createElement("small");
            contact.textContent = [technician.email, technician.phone].filter(Boolean).join(" · ") || "No contact details";
            identity.append(name, contact);
            const status = document.createElement("span");
            status.className = "technician-status";
            status.textContent = technician.is_active === false ? "Inactive" : "Active";
            const actions = document.createElement("div");
            actions.className = "technician-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.textContent = "Edit";
            edit.addEventListener("click", () => openTechnicianForm(technician));
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.textContent = technician.is_active === false ? "Reactivate" : "Deactivate";
            toggle.addEventListener("click", () => setTechnicianActive(technician, technician.is_active === false));
            actions.append(edit, toggle);
            row.append(identity, status, actions);
            technicianList.appendChild(row);
        });
        if (!technicians.length) technicianList.textContent = "No technicians added yet.";
    }

    function openTechnicianForm(technician = null) {
        technicianForm.hidden = false;
        technicianId.value = technician?.id || "";
        technicianName.value = technician?.name || "";
        technicianEmail.value = technician?.email || "";
        technicianPhone.value = technician?.phone || "";
        technicianName.focus();
    }

    async function refreshTechnicians(successMessage) {
        technicians = await window.trackRightTechnicians.load();
        renderTechnicians();
        technicianMessage.className = "settings-message success";
        technicianMessage.textContent = successMessage;
    }

    async function setTechnicianActive(technician, isActive) {
        const { error } = await window.trackRightSupabase.from("personal_fleet_technicians")
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq("id", technician.id).eq("account_id", context.personalAccountId);
        if (error) {
            technicianMessage.className = "settings-message error";
            technicianMessage.textContent = error.message;
            return;
        }
        await refreshTechnicians(isActive ? "Technician reactivated." : "Technician deactivated.");
    }

    document.getElementById("add-technician-button").addEventListener("click", () => openTechnicianForm());
    document.getElementById("cancel-technician-button").addEventListener("click", () => {
        technicianForm.reset(); technicianId.value = ""; technicianForm.hidden = true;
    });

    technicianForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const record = {
            account_id: context.personalAccountId,
            name: technicianName.value.trim(),
            email: technicianEmail.value.trim() || null,
            phone: technicianPhone.value.trim() || null,
            updated_at: new Date().toISOString()
        };
        const query = technicianId.value
            ? window.trackRightSupabase.from("personal_fleet_technicians").update(record).eq("id", technicianId.value).eq("account_id", context.personalAccountId)
            : window.trackRightSupabase.from("personal_fleet_technicians").insert(record);
        const { error } = await query;
        if (error) {
            technicianMessage.className = "settings-message error";
            technicianMessage.textContent = error.message;
            return;
        }
        technicianForm.reset(); technicianId.value = ""; technicianForm.hidden = true;
        await refreshTechnicians("Technician saved.");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (name.length < 2) return;
        const button = form.querySelector("button");
        button.disabled = true;
        message.className = "settings-message";
        message.textContent = "Saving…";
        const { error } = await window.trackRightSupabase.rpc("update_personal_fleet_settings", {
            requested_name: name,
            requested_region: regionalFields.region.value,
            requested_locale: regionalFields.locale.value,
            requested_currency: regionalFields.currency.value,
            requested_distance: regionalFields.distance.value,
            requested_volume: regionalFields.volume.value,
            requested_temperature: regionalFields.temperature.value,
            requested_pressure: regionalFields.pressure.value
        });
        button.disabled = false;
        if (error) {
            message.className = "settings-message error";
            message.textContent = error.message;
            return;
        }
        if (window.trackRightAuth?.personalAccount) Object.assign(window.trackRightAuth.personalAccount, {
            name, region_code: regionalFields.region.value, locale_code: regionalFields.locale.value,
            currency_code: regionalFields.currency.value, distance_unit: regionalFields.distance.value,
            volume_unit: regionalFields.volume.value, temperature_unit: regionalFields.temperature.value,
            pressure_unit: regionalFields.pressure.value
        });
        window.trackRightSetAccountLabel?.(name);
        message.className = "settings-message success";
        message.textContent = "Fleet settings saved.";
    });
})();
