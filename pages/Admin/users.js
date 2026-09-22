(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const list = document.getElementById("users-list");
    const form = document.getElementById("invite-form");
    const message = document.getElementById("users-message");
    const result = document.getElementById("invite-result");
    const linkInput = document.getElementById("invite-link");
    const roles = ["admin", "service_writer", "technician", "read_only"];
    const permissions = [
        ["expenses.write", "Manage accounts payable"],
        ["requests.review", "Review team requests"],
        ["team_documents.manage", "Manage private team documents"],
        ["data.export", "Export shop data"],
        ["data.import", "Restore shop data"],
        ["users.manage", "Manage users and permissions"]
    ];
    let context = null;

    function setMessage(text, isError) {
        message.textContent = text;
        message.className = `users-message ${isError ? "error" : "success"}`;
    }

    function roleLabel(role) {
        return role.replaceAll("_", " ");
    }

    function buildMember(member) {
        const row = document.createElement("article");
        row.className = "user-row permission-editor";
        const summary = document.createElement("div");
        summary.className = "user-summary";
        const identity = document.createElement("div");
        const email = document.createElement("strong");
        email.textContent = member.email;
        identity.append(email);

        const roleSelect = document.createElement("select");
        roleSelect.setAttribute("aria-label", `Role for ${member.email}`);
        const availableRoles = member.role === "owner" ? ["owner"] : roles;
        availableRoles.forEach((role) => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = roleLabel(role);
            option.selected = role === member.role;
            roleSelect.append(option);
        });

        const status = document.createElement("span");
        status.className = "user-status";
        status.textContent = member.is_active ? "Active" : "Disabled";
        const activeLabel = document.createElement("label");
        activeLabel.className = "permission-choice";
        const active = document.createElement("input");
        active.type = "checkbox";
        active.checked = member.is_active;
        activeLabel.append(active, document.createTextNode(" Account enabled"));
        summary.append(identity, roleSelect, status, activeLabel);
        row.append(summary);

        if (member.role === "owner") {
            roleSelect.disabled = true;
            active.disabled = true;
            const note = document.createElement("div");
            note.className = "owner-note";
            note.textContent = "Owners always have full access and cannot be disabled here.";
            row.append(note);
            return row;
        }

        const grid = document.createElement("div");
        grid.className = "user-permissions";
        const boxes = new Map();
        permissions.forEach(([key, label]) => {
            const choice = document.createElement("label");
            choice.className = "permission-choice";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = member.effective_permissions?.[key] === true;
            boxes.set(key, box);
            choice.append(box, document.createTextNode(` ${label}`));
            grid.append(choice);
        });
        row.append(grid);

        roleSelect.addEventListener("change", async function () {
            const preset = await client.rpc("shop_role_permissions", { member_role: this.value });
            if (!preset.error) {
                boxes.forEach((box, key) => { box.checked = preset.data?.[key] === true; });
            }
        });

        const actions = document.createElement("div");
        actions.className = "user-actions";
        const save = document.createElement("button");
        save.type = "button";
        save.className = "save-access";
        save.textContent = "Save Access";
        save.addEventListener("click", async function () {
            if (member.is_active && !active.checked &&
                !window.confirm(`Disable ${member.email}? They will lose access to this shop.`)) {
                active.checked = true;
                return;
            }
            save.disabled = true;
            setMessage("Saving access…", false);
            const presetResult = await client.rpc("shop_role_permissions", { member_role: roleSelect.value });
            if (presetResult.error) {
                setMessage(presetResult.error.message, true);
                save.disabled = false;
                return;
            }
            const overrides = {};
            boxes.forEach((box, key) => {
                const presetValue = presetResult.data?.[key] === true;
                if (box.checked !== presetValue) overrides[key] = box.checked;
            });
            const update = await client.rpc("update_shop_member_access", {
                target_user_id: member.user_id,
                new_role: roleSelect.value,
                permission_overrides: overrides,
                active: active.checked
            });
            save.disabled = false;
            if (update.error) {
                setMessage(update.error.message, true);
                return;
            }
            setMessage(`Access saved for ${member.email}.`, false);
            await loadUsers();
        });
        actions.append(save);
        row.append(actions);
        return row;
    }

    async function loadUsers() {
        context = await window.trackRightAuthReady;
        if (!window.trackRightCan("users.manage")) {
            window.location.replace("../Shop/shop-dashboard.html");
            return;
        }
        const { data, error } = await client.rpc("list_my_shop_members");
        if (error) {
            setMessage(error.message, true);
            return;
        }
        list.replaceChildren();
        data.forEach((member) => list.append(buildMember(member)));
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        await window.trackRightAuthReady;
        const formData = new FormData(form);
        const { data, error } = await client.rpc("create_shop_invitation", {
            invited_email: String(formData.get("email") || "").trim(),
            invited_role: String(formData.get("role") || "technician")
        });
        if (error) {
            setMessage(error.message, true);
            return;
        }
        const inviteUrl = new URL("../../accept-invite.html", window.location.href);
        inviteUrl.searchParams.set("token", data);
        linkInput.value = inviteUrl.href;
        result.hidden = false;
        setMessage("Invite created. It expires in seven days.", false);
        form.reset();
    });

    document.getElementById("copy-invite").addEventListener("click", async function () {
        await navigator.clipboard.writeText(linkInput.value);
        setMessage("Invite link copied.", false);
    });

    loadUsers();
}());
