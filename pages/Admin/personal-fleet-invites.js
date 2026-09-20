(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const form = document.getElementById("personal-invite-form");
    const message = document.getElementById("users-message");
    const result = document.getElementById("invite-result");
    const linkInput = document.getElementById("invite-link");
    const openInvite = document.getElementById("open-invite");
    const list = document.getElementById("personal-invites-list");

    function escapeHtml(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `users-message ${type || ""}`;
    }

    function invitationState(invitation) {
        if (invitation.accepted_at) return "Accepted";
        if (invitation.revoked_at) return "Revoked";
        if (invitation.expires_at && new Date(invitation.expires_at) <= new Date()) return "Expired";
        return "Ready";
    }

    async function loadInvitations() {
        const { data, error } = await client.rpc("list_personal_fleet_invitations");
        if (error) { showMessage(error.message, "error"); return; }
        list.innerHTML = data?.length ? data.map((invitation) => {
            const state = invitationState(invitation);
            return `<article class="user-row invite-row"><div><strong>${escapeHtml(invitation.account_name)}</strong><small>${escapeHtml(invitation.email)}</small></div><span class="user-role">${escapeHtml(invitation.unit_limit)} units · Full beta</span><span class="user-status">${state}</span>${state === "Ready" ? `<button class="revoke-invite" type="button" data-id="${escapeHtml(invitation.id)}">Revoke</button>` : ""}</article>`;
        }).join("") : '<p>No Personal Fleet invitations yet.</p>';
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const submit = form.querySelector("button[type='submit']");
        const data = new FormData(form);
        submit.disabled = true;
        showMessage("Creating invitation…");
        const { data: token, error } = await client.rpc("create_personal_fleet_invitation", {
            invited_email: String(data.get("email") || "").trim(),
            requested_account_name: String(data.get("accountName") || "").trim(),
            requested_expires_at: null
        });
        submit.disabled = false;
        if (error) { showMessage(error.message, "error"); return; }
        const invitationUrl = new URL(`../../personal-fleet-invite.html?token=${encodeURIComponent(token)}`, window.location.href).href;
        linkInput.value = invitationUrl;
        openInvite.href = invitationUrl;
        result.hidden = false;
        showMessage("Invitation ready. Copy the private link and send it to the invited owner.", "success");
        form.reset();
        await loadInvitations();
    });

    document.getElementById("copy-invite").addEventListener("click", async function () {
        await navigator.clipboard.writeText(linkInput.value);
        showMessage("Invitation link copied.", "success");
    });

    list.addEventListener("click", async function (event) {
        const button = event.target.closest(".revoke-invite");
        if (!button || !confirm("Revoke this invitation link?")) return;
        const { error } = await client.rpc("revoke_personal_fleet_invitation", { invitation_id: button.dataset.id });
        if (error) showMessage(error.message, "error");
        else { showMessage("Invitation revoked.", "success"); await loadInvitations(); }
    });

    document.getElementById("refresh-invites").addEventListener("click", loadInvitations);
    window.trackRightAuthReady.then((context) => { if (context) loadInvitations(); });
})();
