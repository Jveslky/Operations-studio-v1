(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const form = document.getElementById("personal-invite-form");
    const message = document.getElementById("users-message");
    const result = document.getElementById("invite-result");
    const linkInput = document.getElementById("invite-link");
    const openInvite = document.getElementById("open-invite");
    const list = document.getElementById("personal-invites-list");
    const columns = {
        Sent: { list: document.getElementById("sent-invitations-list"), count: document.getElementById("sent-invitations-count") },
        Accepted: { list: document.getElementById("accepted-invitations-list"), count: document.getElementById("accepted-invitations-count") },
        Revoked: { list: document.getElementById("revoked-invitations-list"), count: document.getElementById("revoked-invitations-count") }
    };

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
        return "Sent";
    }

    function invitationColumn(state) {
        return state === "Accepted" ? "Accepted" : state === "Sent" ? "Sent" : "Revoked";
    }

    function invitationCard(invitation, state) {
        const statusDate = state === "Accepted" ? invitation.accepted_at : state === "Revoked" ? invitation.revoked_at : null;
        const dateLabel = statusDate ? new Date(statusDate).toLocaleDateString() : "";
        return `<article class="invitation-card">
            <div class="invitation-card-heading"><strong>${escapeHtml(invitation.account_name)}</strong><span class="invitation-state ${state.toLowerCase()}">${escapeHtml(state)}</span></div>
            <small>${escapeHtml(invitation.email)}</small>
            <div class="invitation-card-meta"><span>${escapeHtml(invitation.unit_limit)} units</span><span>Full beta</span>${dateLabel ? `<span>${escapeHtml(dateLabel)}</span>` : ""}</div>
            ${state === "Sent" ? `<button class="revoke-invite" type="button" data-id="${escapeHtml(invitation.id)}">Revoke invitation</button>` : ""}
        </article>`;
    }

    async function loadInvitations() {
        const { data, error } = await client.rpc("list_personal_fleet_invitations");
        if (error) { showMessage(error.message, "error"); return; }
        const groups = { Sent: [], Accepted: [], Revoked: [] };
        (data || []).forEach((invitation) => {
            const state = invitationState(invitation);
            groups[invitationColumn(state)].push({ invitation, state });
        });
        Object.entries(columns).forEach(([name, column]) => {
            const items = groups[name];
            column.count.textContent = String(items.length);
            column.list.innerHTML = items.length
                ? items.map(({ invitation, state }) => invitationCard(invitation, state)).join("")
                : `<div class="invitation-empty">No ${name.toLowerCase()} invitations.</div>`;
        });
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
