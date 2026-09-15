(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const form = document.getElementById("login-form");
    const message = document.getElementById("auth-message");
    const submitButton = form.querySelector("button[type='submit']");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    function requestedDestination() {
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
            ? returnTo
            : "pages/Shop/shop-dashboard.html";
    }

    async function finishPendingShopSetup() {
        const { data: userData } = await client.auth.getUser();
        const shopName =
            localStorage.getItem("track-right-pending-shop-name") ||
            userData.user?.user_metadata?.shop_name;
        if (!shopName) {
            return;
        }

        const { error } = await client.rpc("bootstrap_my_shop", {
            requested_shop_name: shopName
        });

        if (error) {
            throw error;
        }

        localStorage.removeItem("track-right-pending-shop-name");
    }

    client.auth.getSession().then(function ({ data }) {
        if (data.session) {
            window.location.replace(requestedDestination());
        }
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        submitButton.disabled = true;
        showMessage("Signing in…");

        const formData = new FormData(form);
        const { error } = await client.auth.signInWithPassword({
            email: String(formData.get("email") || "").trim(),
            password: String(formData.get("password") || "")
        });

        if (error) {
            showMessage(error.message, "error");
            submitButton.disabled = false;
            return;
        }

        try {
            await finishPendingShopSetup();
            window.location.replace(requestedDestination());
        } catch (setupError) {
            console.error(setupError);
            showMessage(
                "You are signed in, but shop setup could not finish. Contact an administrator.",
                "error"
            );
            submitButton.disabled = false;
        }
    });
})();
