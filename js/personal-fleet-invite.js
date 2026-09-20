(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const token = new URLSearchParams(window.location.search).get("token") ||
        localStorage.getItem("track-right-personal-invite-token");
    const summary = document.getElementById("invite-summary");
    const message = document.getElementById("auth-message");
    const signupForm = document.getElementById("personal-invite-signup-form");
    const acceptButton = document.getElementById("accept-personal-invite");
    const existingAccount = document.getElementById("existing-account-link");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    async function acceptInvitation() {
        if (!token) {
            signupForm.hidden = true;
            acceptButton.hidden = true;
            existingAccount.hidden = true;
            showMessage("Open the complete private invitation link. It must include the invitation code after ?token=.", "error");
            return;
        }
        acceptButton.disabled = true;
        showMessage("Opening your Personal Fleet…");
        const fleetName = signupForm.elements.fleetName?.value.trim() ||
            localStorage.getItem("track-right-pending-fleet-name") || "";
        const { error } = await client.rpc("accept_personal_fleet_invitation", {
            invitation_token: token,
            requested_fleet_name: fleetName
        });
        if (error) {
            showMessage(error.message, "error");
            acceptButton.disabled = false;
            return;
        }
        localStorage.removeItem("track-right-personal-invite-token");
        localStorage.removeItem("track-right-pending-fleet-name");
        window.location.replace("pages/PersonalFleet/Personaldashboard.html");
    }

    async function initialize() {
        if (!token) {
            summary.textContent = "This invitation link is incomplete.";
            signupForm.hidden = true;
            acceptButton.hidden = true;
            existingAccount.hidden = true;
            showMessage("Return to Fleet beta invites and use Copy or Open on the active invitation.", "error");
            return;
        }
        const { data: details, error } = await client.rpc("get_personal_fleet_invitation", {
            invitation_token: token
        });
        if (error || !details?.length) {
            summary.textContent = "This invitation is invalid or no longer available.";
            return;
        }
        const invitation = details[0];
        summary.textContent = `You’re invited to create ${invitation.account_name}, with the complete beta toolset for up to ${invitation.unit_limit} units.`;
        localStorage.setItem("track-right-personal-invite-token", token);
        if (!localStorage.getItem("track-right-pending-fleet-name")) {
            localStorage.setItem("track-right-pending-fleet-name", invitation.account_name);
        }
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData.session) {
            acceptButton.hidden = false;
            return;
        }
        signupForm.elements.email.value = invitation.email;
        signupForm.elements.fleetName.value = invitation.account_name;
        signupForm.hidden = false;
        const returnPath = `${window.location.pathname}?token=${encodeURIComponent(token)}`;
        existingAccount.querySelector("a").href = `login.html?returnTo=${encodeURIComponent(returnPath)}`;
        existingAccount.hidden = false;
    }

    signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!token) {
            await acceptInvitation();
            return;
        }
        const formData = new FormData(signupForm);
        localStorage.setItem("track-right-pending-fleet-name", String(formData.get("fleetName") || "").trim());
        const redirectUrl = new URL("personal-fleet-invite.html", window.location.href);
        redirectUrl.searchParams.set("token", token);
        const { data, error } = await client.auth.signUp({
            email: String(formData.get("email")),
            password: String(formData.get("password")),
            options: {
                data: { full_name: String(formData.get("fullName") || "").trim() },
                emailRedirectTo: redirectUrl.href
            }
        });
        if (error) {
            showMessage(error.message, "error");
            return;
        }
        if (data.session) await acceptInvitation();
        else {
            signupForm.hidden = true;
            showMessage("Confirm your email, then return here to finish your invitation.", "success");
        }
    });

    acceptButton.addEventListener("click", acceptInvitation);
    initialize();
})();
