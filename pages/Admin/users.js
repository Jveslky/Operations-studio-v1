(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const list = document.getElementById("users-list");
    const form = document.getElementById("invite-form");
    const message = document.getElementById("users-message");
    const result = document.getElementById("invite-result");
    const linkInput = document.getElementById("invite-link");

    function setMessage(text, isError) {
        message.textContent = text;
        message.className = `users-message${isError ? " error" : ""}`;
    }

    async function loadUsers() {
        await window.trackRightAuthReady;
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
        data.forEach(function (member) {
            const row = document.createElement("div");
            row.className = "user-row";

            const email = document.createElement("span");
            email.textContent = member.email;
            const role = document.createElement("span");
            role.className = "user-role";
            role.textContent = member.role.replace("_", " ");
            const status = document.createElement("span");
            status.className = "user-status";
            status.textContent = member.is_active ? "Active" : "Disabled";

            row.append(email, role, status);
            list.appendChild(row);
        });
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
})();
