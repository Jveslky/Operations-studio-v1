(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const token = new URLSearchParams(window.location.search).get("token") ||
        localStorage.getItem("track-right-invite-token");
    const summary = document.getElementById("invite-summary");
    const message = document.getElementById("auth-message");
    const signupForm = document.getElementById("invite-signup-form");
    const loginLink = document.getElementById("invite-login-link");
    const switchButton = document.getElementById("invite-switch-account");
    let invitationEmail = "";
    const acceptButton = document.getElementById("accept-invite-button");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    function loginDestination() {
        const destination = new URL("accept-invite.html", window.location.href);
        destination.searchParams.set("token", token);
        const login = new URL("login.html", window.location.href);
        login.searchParams.set("returnTo", destination.pathname + destination.search);
        return login.href;
    }

    function showSession(session) {
        const matches = session?.user?.email?.trim().toLowerCase() === invitationEmail;
        signupForm.hidden = !!session;
        acceptButton.hidden = !matches;
        switchButton.hidden = !session || matches;
        loginLink.hidden = !!session;
        if (session && !matches) showMessage("You are signed in as " + session.user.email + ". Sign in with the invited email to join.", "error");
        else if (matches) showMessage("Signed in with the invited email. Accept below to join.");
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
        showMessage("Invitation accepted. Opening Long Shift…", "success");
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
        invitationEmail = invitation.email.trim().toLowerCase();
        loginLink.href = loginDestination();
        summary.textContent = `You’ve been invited to ${invitation.shop_name} as ${invitation.role.replace("_", " ")}.`;
        localStorage.setItem("track-right-invite-token", token);

        const { data: sessionData } = await client.auth.getSession();
        signupForm.elements.email.value = invitation.email;
        showSession(sessionData.session);
        client.auth.onAuthStateChange((_event, session) => {
            showSession(session);
        });
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
            loginLink.hidden = false;
            showMessage("If email confirmation is required, follow the confirmation email. Already confirmed or already have an account? Use Sign in to join below; your invitation is preserved.", "success");
        }
    });

    switchButton.addEventListener("click", async () => {
        switchButton.disabled = true;
        const { error } = await client.auth.signOut();
        if (error) { showMessage(error.message, "error"); switchButton.disabled = false; return; }
        window.location.replace(loginDestination());
    });
    acceptButton.addEventListener("click", acceptInvite);
    initialize();
})();
