(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const token = new URLSearchParams(window.location.search).get("token") ||
        localStorage.getItem("track-right-invite-token");
    const summary = document.getElementById("invite-summary");
    const message = document.getElementById("auth-message");
    const signupForm = document.getElementById("invite-signup-form");
    const acceptButton = document.getElementById("accept-invite-button");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    async function acceptInvite() {
        acceptButton.disabled = true;
        const { error } = await client.rpc("accept_shop_invitation", {
            invitation_token: token
        });

        if (error) {
            showMessage(error.message, "error");
            acceptButton.disabled = false;
            return;
        }

        localStorage.removeItem("track-right-invite-token");
        showMessage("Invitation accepted. Opening Track Right…", "success");
        window.location.replace("pages/Shop/shop-dashboard.html");
    }

    async function initialize() {
        if (!token) {
            summary.textContent = "This invitation link is incomplete.";
            return;
        }

        const { data: details, error } = await client.rpc("get_shop_invitation", {
            invitation_token: token
        });

        if (error || !details?.length) {
            summary.textContent = "This invitation is invalid or has expired.";
            return;
        }

        const invitation = details[0];
        summary.textContent = `You’ve been invited to ${invitation.shop_name} as ${invitation.role.replace("_", " ")}.`;
        localStorage.setItem("track-right-invite-token", token);

        const { data: sessionData } = await client.auth.getSession();
        if (sessionData.session) {
            acceptButton.hidden = false;
            return;
        }

        signupForm.elements.email.value = invitation.email;
        signupForm.hidden = false;
    }

    signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const formData = new FormData(signupForm);
        const redirectUrl = new URL("accept-invite.html", window.location.href);
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

        if (data.session) {
            await acceptInvite();
        } else {
            signupForm.hidden = true;
            showMessage("Confirm your email, then this invitation will finish automatically.", "success");
        }
    });

    acceptButton.addEventListener("click", acceptInvite);
    initialize();
})();
