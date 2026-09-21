(function () {
    "use strict";
    const form = document.getElementById("fleet-settings-form");
    const nameInput = document.getElementById("fleet-name");
    const message = document.getElementById("settings-message");
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
        renderTechnicians();
    });

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
        const { error } = await window.trackRightSupabase.rpc("update_personal_fleet_name", {
            requested_name: name
        });
        button.disabled = false;
        if (error) {
            message.className = "settings-message error";
            message.textContent = error.message;
            return;
        }
        if (window.trackRightAuth?.personalAccount) window.trackRightAuth.personalAccount.name = name;
        window.trackRightSetAccountLabel?.(name);
        message.className = "settings-message success";
        message.textContent = "Fleet name saved.";
    });
})();
